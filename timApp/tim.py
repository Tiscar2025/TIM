# -*- coding: utf-8 -*-

import http.client
import pprint
import time
import traceback
from datetime import datetime
from datetime import timezone

import werkzeug.exceptions as ex
from flask import Response
from flask import g, abort, flash
from flask import redirect
from flask import render_template
from flask import request
from flask import session
from flask_assets import Environment
from markupsafe import Markup
from werkzeug.contrib.profiler import ProfilerMiddleware

from timApp.admin.routes import admin_bp
from timApp.document.course.routes import course_blueprint
from timApp.document.routes import doc_bp
from timApp.document.translation.routes import tr_bp
from timApp.plugin.routes import plugin_bp
from timApp.item.routes_tags import tags_blueprint
from timApp.util.flask.ReverseProxied import ReverseProxied
from timApp.auth.accesshelper import verify_edit_access, verify_view_access, \
    ItemLockedException, get_doc_or_abort
from timApp.util.flask.cache import cache
from timApp.document.create_item import get_templates_for_folder
from timApp.document.document import Document
from timApp.util.logger import log_info, log_error, log_debug, log_warning
from timApp.document.minutes.routes import minutes_blueprint
from timApp.util.flask.responsehelper import json_response, ok_response
from timApp.velp.annotation import annotations
from timApp.answer.routes import answers
from timApp.bookmark.routes import bookmarks
from timApp.document.editing.routes_clipboard import clipboard
from timApp.document.editing.routes import edit_page
from timApp.gamification.generateMap import generateMap
from timApp.admin.global_notification import global_notification
from timApp.user.groups import groups
from timApp.lecture.routes import lecture_routes
from timApp.auth.login import login_page, logout
from timApp.item.manage import manage_page
from timApp.note.routes import notes
from timApp.notification.notify import notify, send_email
from timApp.printing.print import print_blueprint
from timApp.plugin.qst.qst import qst_plugin
from timApp.plugin.timtable.timTable import timTable_plugin
from timApp.readmark.routes import readings
from timApp.util.flask.search import search_routes
from timApp.user.settings.settings import settings_page
from timApp.util.flask.routes_static import static_bp
from timApp.upload.upload import upload
from timApp.velp.velp import velps
from timApp.item.routes import view_page
from timApp.auth.sessioninfo import get_current_user_object, get_other_users_as_list, get_current_user_id, \
    logged_in, current_user_in_lecture
from timApp.tim_app import app, default_secret
from timApp.bookmark.bookmarks import Bookmarks
from timApp.timdb.exceptions import ItemAlreadyExistsException
from timApp.document.docentry import DocEntry
from timApp.folder.folder import Folder
from timApp.user.user import User
from timApp.timdb.sqa import db
from timApp.user.userutils import NoSuchUserException

cache.init_app(app)

app.register_blueprint(generateMap)
app.register_blueprint(settings_page)
app.register_blueprint(manage_page)
app.register_blueprint(qst_plugin)
app.register_blueprint(timTable_plugin)
app.register_blueprint(edit_page)
app.register_blueprint(view_page)
app.register_blueprint(login_page)
app.register_blueprint(answers)
app.register_blueprint(velps)
app.register_blueprint(annotations)
app.register_blueprint(groups)
app.register_blueprint(search_routes)
app.register_blueprint(upload)
app.register_blueprint(notes)
app.register_blueprint(readings)
app.register_blueprint(lecture_routes)
app.register_blueprint(clipboard)
app.register_blueprint(notify)
app.register_blueprint(bookmarks)
app.register_blueprint(global_notification)
app.register_blueprint(static_bp)
app.register_blueprint(print_blueprint)
app.register_blueprint(minutes_blueprint)
app.register_blueprint(tr_bp)
app.register_blueprint(doc_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(plugin_bp)
app.register_blueprint(tags_blueprint)
app.register_blueprint(course_blueprint)

app.wsgi_app = ReverseProxied(app.wsgi_app)

assets = Environment(app)


def error_generic(error, code):
    if 'text/html' in request.headers.get("Accept", ""):
        return render_template('error.html',
                               message=error.description,
                               code=code,
                               status=http.client.responses[code]), code
    else:
        return json_response({'error': error.description}, code)


@app.context_processor
def inject_custom_css() -> dict:
    """Injects the user prefs variable to all templates."""
    prefs = get_current_user_object().get_prefs()
    return dict(prefs=prefs)


@app.context_processor
def inject_user() -> dict:
    """"Injects the user object to all templates."""
    return dict(
        current_user=get_current_user_object(),
        other_users=get_other_users_as_list(),
    )


@app.context_processor
def inject_bookmarks() -> dict:
    """"Injects bookmarks to all templates."""
    if not logged_in():
        return {}
    return dict(bookmarks=Bookmarks(User.query.get(get_current_user_id())).as_dict())


@app.errorhandler(400)
def bad_request(error):
    return error_generic(error, 400)


# noinspection PyClassHasNoInit
class Forbidden(ex.HTTPException):
    code = 403
    description = "Sorry, you don't have permission to view this resource."


ex._aborter.mapping[403] = Forbidden


@app.errorhandler(Forbidden)
def forbidden(error):
    return error_generic(error, 403)


@app.errorhandler(ItemAlreadyExistsException)
def already_exists(error: ItemAlreadyExistsException):
    return error_generic(Forbidden(description=str(error)), 403)


@app.errorhandler(500)
def internal_error(error):
    log_error(get_request_message(500, include_body=True))
    help_email = app.config['HELP_EMAIL']
    error.description = Markup('Something went wrong with the server, sorry. '
                               'TIM developers have been notified about this. '
                               f'If the problem persists, please send email to <a href="mailto:{help_email}">{help_email}</a>.')
    tb = traceback.format_exc()
    message = f"""
Exception happened on {datetime.now(tz=timezone.utc)} at {request.url}

{get_request_message(500, include_body=True)}

{tb}
""".strip()
    db.session.rollback()
    u = get_current_user_object()
    send_email(rcpt=app.config['ERROR_EMAIL'],
               subject=f'{app.config["TIM_HOST"]}: Error at {request.path} ({u.name})',
               mail_from=app.config['WUFF_EMAIL'],
               reply_to=f'{app.config["ERROR_EMAIL"]},{u.email}',
               msg=message)
    return error_generic(error, 500)


@app.route('/empty')
def empty_response_route():
    return Response('', mimetype='text/plain')


@app.errorhandler(ItemLockedException)
def item_locked(error: ItemLockedException):
    item = DocEntry.find_by_id(error.access.block_id)
    is_folder = False
    if not item:
        is_folder = True
        item = Folder.get_by_id(error.access.block_id)
    if not item:
        abort(404)
    return render_template('duration_unlock.html',
                           item=item,
                           item_type='folder' if is_folder else 'document',
                           access=error.access), 403


@app.errorhandler(NoSuchUserException)
def handle_user_not_found(error):
    if error.user_id == session['user_id']:
        flash(f'Your user id ({error.user_id}) was not found in the database. Clearing session automatically.')
        return logout()
    return error_generic(error, 500)


@app.errorhandler(503)
def service_unavailable(error):
    return error_generic(error, 503)


@app.errorhandler(413)
def entity_too_large(error):
    error.description = f'Your file is too large to be uploaded. Maximum size is {app.config["MAX_CONTENT_LENGTH"] / 1024 / 1024} MB.'
    return error_generic(error, 413)


@app.errorhandler(404)
def not_found(error):
    return error_generic(error, 404)


@app.route("/ping")
def ping():
    return ok_response()


@app.route("/getTemplates")
def get_templates():
    current_path = request.args.get('item_path', '')
    d = DocEntry.find_by_path(current_path)
    if not d:
        abort(404)
    verify_edit_access(d)
    templates = get_templates_for_folder(d.parent)
    return json_response(templates)


@app.route("/index/<int:doc_id>")
def get_index(doc_id):
    d = get_doc_or_abort(doc_id)
    verify_view_access(d)
    index = Document(doc_id).get_index()
    if not index:
        return json_response({'empty': True})
    else:
        return render_template('partials/content.html',
                               headers=index)


@app.route("/sessionsetting/<setting>/<value>", methods=['POST'])
def set_session_setting(setting, value):
    try:
        if 'settings' not in session:
            session['settings'] = {}
        session['settings'][setting] = value
        session.modified = True
        return json_response(session['settings'])
    except (NameError, KeyError):
        abort(404)


@app.route("/getServerTime", methods=['GET'])
def get_server_time():
    t2 = int(time.time() * 1000)
    t1 = int(request.args.get('t1'))
    return json_response({'t1': t1, 't2': t2, 't3': int(time.time() * 1000)})


@app.route("/")
def start_page():
    in_lecture = current_user_in_lecture()
    return render_template('start.html',
                           in_lecture=in_lecture)


@app.before_request
def preprocess_request():
    session.permanent = True
    if request.method == 'GET':
        p = request.path
        if '//' in p or (p.endswith('/') and p != '/'):
            fixed_url = p.rstrip('/').replace('//', '/') + '?' + request.query_string.decode()
            return redirect(fixed_url)


@app.after_request
def disable_cache_for_testing(response):
    """Chrome WebDriver caches JavaScript files which causes SystemJS.import('tim') to not get executed properly.
    It is either WebDriver or SystemJS bug.
    
    The workaround is to disable the cache.
    """
    if app.config['TESTING']:
        response.headers["Cache-Control"] = "max-age=0, must-revalidate"
    return response


def should_log_request():
    p = request.path
    # don't log OpenID completion URL because it contains email etc.
    if p.startswith('/openIDLogin') and b'&openid_complete=yes' in request.query_string:
        return False
    if p.startswith('/static/'):
        return False
    if p == '/favicon.ico':
        return False
    return True


@app.after_request
def log_request(response):
    if should_log_request():
        status_code = response.status_code
        log_info(get_request_message(status_code))
        if request.method in ('PUT', 'POST', 'DELETE'):
            log_debug(request.get_json(silent=True))
    return response


def get_request_message(status_code=None, include_body=False):
    msg = f'{get_current_user_object().name} [{request.headers.get("X-Forwarded-For") or request.remote_addr}]: {request.method} {request.full_path if request.query_string else request.path} {status_code or ""}'.strip()
    if not include_body or request.method not in ('POST', 'PUT', 'DELETE'):
        return msg
    return f'{msg}\n\n{pprint.pformat(request.get_json(silent=True) or request.get_data(as_text=True))}'


@app.after_request
def close_db(response):
    if hasattr(g, 'timdb'):
        g.timdb.close()
    return response


@app.after_request
def del_g(response):
    """For some reason, the g object is not cleared when running browser test, so we do it here."""
    if app.config['TESTING']:
        if hasattr(g, 'user'):
            del g.user
        if hasattr(g, 'viewable'):
            del g.viewable
        if hasattr(g, 'editable'):
            del g.editable
        if hasattr(g, 'teachable'):
            del g.teachable
        if hasattr(g, 'manageable'):
            del g.manageable
        if hasattr(g, 'see_answers'):
            del g.see_answers
        if hasattr(g, 'owned'):
            del g.owned
    return response


# noinspection PyUnusedLocal
@app.teardown_appcontext
def close_db_appcontext(e):
    if not app.config['TESTING'] and hasattr(g, 'timdb'):
        g.timdb.close()


def init_app():
    with app.app_context():
        cache.clear()

    if app.config['PROFILE']:
        app.wsgi_app = ProfilerMiddleware(app.wsgi_app, sort_by=('cumtime',), restrictions=[100])

    log_info(f'Debug mode: {app.config["DEBUG"]}')
    log_info(f'Profiling: {app.config["PROFILE"]}')
    log_info(f'Using database: {app.config["DATABASE"]}')
    if not app.config.from_pyfile(app.config['SECRET_FILE_PATH'], silent=True):
        log_warning('secret file not found, using default values - do not run in production!')
    else:
        assert default_secret != app.config['SECRET_KEY']
    return app


def start_app():
    init_app()
    app.run(host='0.0.0.0',
            port=5000,
            use_evalex=False,
            use_reloader=False,
            threaded=True)
