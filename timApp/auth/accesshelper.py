from datetime import datetime, timezone
from typing import Optional, Tuple

from flask import flash
from flask import request, g
from sqlalchemy import inspect
from werkzeug.exceptions import abort

from timApp.auth.accesstype import AccessType
from timApp.auth.auth_models import BlockAccess
from timApp.auth.sessioninfo import logged_in, get_other_users_as_list, \
    get_current_user_group, get_current_user_object
from timApp.document.docentry import DocEntry
from timApp.document.docinfo import DocInfo
from timApp.document.docparagraph import DocParagraph
from timApp.document.document import Document, dereference_pars
from timApp.folder.folder import Folder
from timApp.item.item import Item, ItemBase
from timApp.plugin.plugin import Plugin, find_plugin_from_document, maybe_get_plugin_from_par
from timApp.plugin.pluginexception import PluginException
from timApp.plugin.taskid import TaskId, TaskIdAccess
from timApp.timdb.exceptions import TimDbException
from timApp.timdb.sqa import db
from timApp.user.user import ItemOrBlock, User
from timApp.user.usergroup import UserGroup
from timApp.user.userutils import get_access_type_id, grant_access
from timApp.util.flask.requesthelper import get_option
from timApp.util.utils import get_current_time


def get_doc_or_abort(doc_id: int, msg: str = None):
    d = DocEntry.find_by_id(doc_id)
    if not d:
        abort(404, msg or 'Document not found')
    return d


def get_item_or_abort(item_id: int):
    i = Item.find_by_id(item_id)
    if not i:
        abort(404, 'Item not found')
    return i


def get_folder_or_abort(folder_id: int):
    f = Folder.get_by_id(folder_id)
    if not f:
        abort(404, 'Folder not found')
    return f


def verify_admin():
    if not check_admin_access():
        abort(403, 'This action requires administrative rights.')


def verify_edit_access(b: ItemOrBlock, require=True, message=None, check_duration=False, check_parents=False):
    u = get_current_user_object()
    has_access = u.has_edit_access(b)
    if not has_access and check_parents:
        # Only uploaded files and images have a parent so far.
        has_access = any(u.has_edit_access(p) for p in b.parents)
    return abort_if_not_access_and_required(u.has_edit_access(b), b.id, 'edit', require, message,
                                            check_duration)


def verify_manage_access(b: ItemOrBlock, require=True, message=None, check_duration=False):
    u = get_current_user_object()
    return abort_if_not_access_and_required(u.has_manage_access(b), b.id, 'manage', require, message,
                                            check_duration)


def verify_access(b: ItemOrBlock, access_type: AccessType, require: bool = True, message: Optional[str] = None):
    u = get_current_user_object()
    if access_type == AccessType.view:
        return abort_if_not_access_and_required(u.has_view_access(b), b.id, access_type, require, message)
    elif access_type == AccessType.edit:
        return abort_if_not_access_and_required(u.has_edit_access(b), b.id, access_type, require, message)
    elif access_type == AccessType.see_answers:
        return abort_if_not_access_and_required(u.has_seeanswers_access(b), b.id, access_type, require, message)
    elif access_type == AccessType.teacher:
        return abort_if_not_access_and_required(u.has_teacher_access(b), b.id, access_type, require, message)
    elif access_type == AccessType.manage:
        return abort_if_not_access_and_required(u.has_manage_access(b), b.id, access_type, require, message)
    abort(400, 'Bad request - unknown access type')


def verify_view_access(b: ItemOrBlock, require=True, message=None, check_duration=False, check_parents=False):
    u = get_current_user_object()
    has_access = u.has_view_access(b)
    if not has_access and check_parents:
        # Only uploaded files and images have a parent so far.
        has_access = any(u.has_view_access(p) for p in b.parents)
    return abort_if_not_access_and_required(has_access, b.id, 'view', require, message, check_duration)


def verify_teacher_access(b: ItemOrBlock, require=True, message=None, check_duration=False):
    u = get_current_user_object()
    return abort_if_not_access_and_required(u.has_teacher_access(b), b.id, 'teacher', require, message, check_duration)


def verify_seeanswers_access(b: ItemOrBlock, require=True, message=None, check_duration=False):
    u = get_current_user_object()
    return abort_if_not_access_and_required(u.has_seeanswers_access(b), b.id, 'see answers', require, message,
                                            check_duration)


class ItemLockedException(Exception):
    """The exception that is raised (in /view route) when a user attempts to access an item for which he has a duration
    access that has not yet begun."""

    def __init__(self, access: BlockAccess):
        self.access = access


def abort_if_not_access_and_required(access_obj: BlockAccess,
                                     block_id: int,
                                     access_type,
                                     require=True,
                                     message=None,
                                     check_duration=False):
    if access_obj:
        return access_obj
    if check_duration:
        ba = BlockAccess.query.filter_by(block_id=block_id,
                                         type=get_access_type_id(access_type),
                                         usergroup_id=get_current_user_group()).first()
        if ba is None:
            ba_group: BlockAccess = BlockAccess.query.filter_by(block_id=block_id,
                                                                type=get_access_type_id(access_type)).filter(
                BlockAccess.usergroup_id.in_(get_current_user_object().get_groups().with_entities(UserGroup.id))
            ).first()
            if ba_group is not None:
                ba = BlockAccess(block_id=ba_group.block_id,
                                 type=ba_group.type,
                                 usergroup_id=get_current_user_group(),
                                 accessible_from=ba_group.accessible_from,
                                 accessible_to=ba_group.accessible_to,
                                 duration=ba_group.duration,
                                 duration_from=ba_group.duration_from,
                                 duration_to=ba_group.duration_to)
        if ba is not None:
            unlock = get_option(request, 'unlock', False)
            if unlock and ba.unlockable:
                ba.accessible_from = get_current_time()
                ba.accessible_to = ba.accessible_from + ba.duration

                # if this is a group duration, it means we created a personal BlockAccess instance above, so we
                # need to add it
                if inspect(ba).transient:
                    db.session.add(ba)
                db.session.commit()  # TODO ensure nothing else gets committed than the above
                flash('Item was unlocked successfully.')
                if ba.accessible_from < ba.accessible_to:
                    return ba
                else:
                    raise ItemLockedException(ba)
            else:
                raise ItemLockedException(ba)
    if require:
        abort(403, message or "Sorry, you don't have permission to view this resource.")
    return None


def has_view_access(b: ItemOrBlock):
    u = get_current_user_object()
    return u.has_view_access(b)


def has_edit_access(b: ItemOrBlock):
    return get_current_user_object().has_edit_access(b)


def has_comment_right(b: ItemOrBlock):
    return has_view_access(b) if logged_in() else None


def has_read_marking_right(b: ItemOrBlock):
    return has_view_access(b) if logged_in() else None


def has_teacher_access(b: ItemOrBlock):
    return get_current_user_object().has_teacher_access(b)


def has_manage_access(b: ItemOrBlock):
    return get_current_user_object().has_manage_access(b)


def has_seeanswers_access(b: ItemOrBlock):
    return get_current_user_object().has_seeanswers_access(b)


def has_ownership(b: ItemOrBlock):
    return get_current_user_object().has_ownership(b)


def check_admin_access(block_id=None):
    curr_user = get_current_user_object()
    if curr_user.is_admin:
        return BlockAccess(block_id=block_id,
                           accessible_from=datetime.min.replace(tzinfo=timezone.utc),
                           type=AccessType.owner.value,
                           usergroup_id=curr_user.get_personal_group().id)
    return None


def get_rights(d: ItemBase):
    u = get_current_user_object()
    return {'editable': bool(u.has_edit_access(d)),
            'can_mark_as_read': bool(logged_in() and u.has_view_access(d)),
            'can_comment': bool(logged_in() and u.has_view_access(d)),
            'browse_own_answers': logged_in(),
            'teacher': bool(u.has_teacher_access(d)),
            'see_answers': bool(u.has_seeanswers_access(d)),
            'manage': bool(u.has_manage_access(d)),
            'owner': bool(u.has_ownership(d))
            }


def verify_logged_in():
    if not logged_in():
        abort(403, "You have to be logged in to perform this action.")


def verify_ownership(b: ItemOrBlock, require=True, message=None, check_duration=False):
    u = get_current_user_object()
    return abort_if_not_access_and_required(u.has_ownership(b), b.id, 'owner', require, message,
                                            check_duration)


def verify_read_marking_right(b: ItemOrBlock):
    if not has_read_marking_right(b):
        abort(403)


def verify_comment_right(b: ItemOrBlock):
    if not has_comment_right(b):
        abort(403)


def get_plugin_from_request(doc: Document, task_id: TaskId, u: User) -> Tuple[Document, Plugin]:
    assert doc.doc_id == task_id.doc_id
    orig_doc_id, orig_par_id = get_orig_doc_and_par_id_from_request()
    plug = find_plugin_from_document(doc, task_id, u)
    par_id = plug.par.get_id()
    if orig_doc_id is None or orig_par_id is None:
        if not doc.has_paragraph(par_id):
            return abort(400, 'Plugin not found')
        return doc, plug
    if orig_doc_id != doc.doc_id:
        orig_doc = Document(orig_doc_id)
    else:
        orig_doc = doc
    orig_doc.insert_preamble_pars()
    try:
        orig_par = orig_doc.get_paragraph(orig_par_id)
    except TimDbException:
        raise PluginException(f'Plugin paragraph not found: {orig_par_id}')
    pars = dereference_pars([orig_par], context_doc=orig_doc)
    ctx_doc = orig_doc if (not orig_doc.get_docinfo().is_original_translation and orig_par.is_translation()) else doc
    for p in pars:
        if p.get_id() == par_id:
            return ctx_doc, maybe_get_plugin_from_par(p, task_id, u)
    return doc, plug


def get_orig_doc_and_par_id_from_request() -> Tuple[int, str]:
    ref_from = ((request.get_json() or {}).get('ref_from') or {})
    doc_id = ref_from.get('docId', get_option(request, 'ref_from_doc_id',
                                              default=None, cast=int))
    par_id = ref_from.get('par', get_option(request, 'ref_from_par_id',
                                            default=None))
    return doc_id, par_id


def verify_task_access(
        d: DocInfo,
        task_id: TaskId,
        access_type: AccessType,
        required_task_access_level: TaskIdAccess,
        context_user: User = None,
) -> Plugin:
    assert d.id == task_id.doc_id
    u = get_current_user_object()
    doc, found_plugin = get_plugin_from_request(d.document, task_id, context_user or u)
    verify_access(doc.get_docinfo(), access_type)
    if found_plugin.task_id.access_specifier == TaskIdAccess.ReadOnly and \
            required_task_access_level == TaskIdAccess.ReadWrite and \
            not u.has_teacher_access(doc.get_docinfo()):
        abort(403, 'This task/field is readonly and thus only writable for teachers.')
    return found_plugin


def grant_access_to_session_users(block_id: int):
    for u in get_other_users_as_list():
        grant_access(User.get_by_id(int(u['id'])).get_personal_group().id,
                     block_id,
                     'manage',
                     commit=False)


def reset_request_access_cache():
    del_attr_if_exists(g, 'manageable')
    del_attr_if_exists(g, 'viewable')
    del_attr_if_exists(g, 'teachable')
    del_attr_if_exists(g, 'see_answers')
    del_attr_if_exists(g, 'owned')
    del_attr_if_exists(g, 'editable')


def del_attr_if_exists(obj, attr_name: str):
    if hasattr(obj, attr_name):
        delattr(obj, attr_name)


def can_see_par_source(u: User, p: DocParagraph):
    d = p.doc.get_docinfo()
    if u.has_edit_access(d):
        return True
    if not u.has_view_access(d):
        return False
    if not p.is_plugin() and not p.has_plugins():
        return True
    return False
