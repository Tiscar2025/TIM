"""Answer-related routes."""

from flask import Blueprint

from .common import *
import pluginControl
import containerLink


answers = Blueprint('answers',
                    __name__,
                    url_prefix='')


def parse_task_id(task_id):
    """

    :rtype: tuple[int, str]
    :type task_id: str
    :param task_id: task_id that is of the form "22.palindrome"
    :return: tuple of the form (22, "palindrome")
    """
    pieces = task_id.split('.')
    if len(pieces) != 2:
        abort(400, 'The format of task_id is invalid. Expected exactly one dot character.')
    doc_id = int(pieces[0])
    task_id_name = pieces[1]
    return doc_id, task_id_name


def is_answer_valid(plugin_type, plugin_yaml, old_answers, tim_info):
    """Determines whether the currently posted answer should be considered valid.

    :param plugin_type: The type of the plugin to which the answer was posted.
    :param plugin_yaml: The YAML markup as a dict that was used in the plugin.
    :param old_answers: The old answers for this task for the current user.
    :param tim_info: The tim_info structure returned by the plugin or None.
    :return: True if the answer should be considered valid, False otherwise.
    """
    if plugin_type == 'mmcq' and len(old_answers) > 0:
        return False
    return True


@answers.route("/<plugintype>/<task_id>/answer/", methods=['PUT'])
def save_answer(plugintype, task_id):
    """
    Saves the answer submitted by user for a plugin in the database.

    :type task_id: str
    :type plugintype: str
    :param plugintype: The type of the plugin, e.g. csPlugin.
    :param task_id: The task id of the form "22.palidrome".
    :return: JSON
    """
    timdb = getTimDb()
    doc_id, task_id_name = parse_task_id(task_id)
    # If the user doesn't have access to the document, we need to check if the plugin was referenced
    # from another document
    if not verifyViewAccess(doc_id, require=False):
        orig_doc = request.get_json().get('ref_from', {}).get('docId', doc_id)
        verifyViewAccess(orig_doc)
        par_id = request.get_json().get('ref_from', {}).get('par', doc_id)
        par = Document(orig_doc).get_paragraph(par_id)
        if not par.is_reference():
            abort(403)
        pars = pluginControl.dereference_pars([par])
        if not any(p.get_attr('taskId') == task_id_name for p in pars):
            abort(403)
    if 'input' not in request.get_json():
        return jsonResponse({'error': 'The key "input" was not found from the request.'}, 400)
    answerdata = request.get_json()['input']

    answer_browser_data = request.get_json().get('abData', {})
    is_teacher = answer_browser_data.get('teacher', False)
    if is_teacher:
        verifyOwnership(doc_id)

    # Load old answers
    old_answers = timdb.answers.getAnswers(getCurrentUserId(), task_id)

    # Get the newest answer (state). Only for logged in users.
    state = pluginControl.try_load_json(old_answers[0]['content']) if loggedIn() and len(old_answers) > 0 else None

    par = Document(doc_id).get_paragraph_by_task(task_id_name)
    if par is None:
        abort(400, 'Task not found in the document: ' + task_id_name)
    plugin_data = pluginControl.parse_plugin_values(par)
    if 'error' in plugin_data:
        return jsonResponse({'error': plugin_data['error'] + ' Task id: ' + task_id_name}, 400)

    answer_call_data = {'markup': plugin_data['markup'], 'state': state, 'input': answerdata, 'taskID': task_id}

    plugin_response = containerLink.call_plugin_answer(plugintype, answer_call_data)

    try:
        jsonresp = json.loads(plugin_response)
    except ValueError:
        return jsonResponse({'error': 'The plugin response was not a valid JSON string. The response was: '
                                      + plugin_response}, 400)

    if 'web' not in jsonresp:
        return jsonResponse({'error': 'The key "web" is missing in plugin response.'}, 400)

    if 'save' in jsonresp:
        save_object = jsonresp['save']
        tags = []
        tim_info = jsonresp.get('tim_info', {})
        points = tim_info.get('points', None)

        # Save the new state
        try:
            tags = save_object['tags']
        except (TypeError, KeyError):
            pass
        if not is_teacher:
            is_valid = is_answer_valid(plugintype, plugin_data['markup'], old_answers, tim_info)
            timdb.answers.saveAnswer([getCurrentUserId()], task_id, json.dumps(save_object), points, tags, is_valid)
        else:
            if answer_browser_data.get('saveTeacher', False):
                answer_id = answer_browser_data.get('answer_id', None)
                if answer_id is None:
                    return jsonResponse({'error': 'Missing answer_id key'}, 400)
                expected_task_id = timdb.answers.get_task_id(answer_id)
                if expected_task_id != task_id:
                    return jsonResponse({'error': 'Task ids did not match'}, 400)
                users = timdb.answers.get_users(answer_id)
                if len(users) == 0:
                    return jsonResponse({'error': 'No users found for the specified answer'}, 400)
                if not getCurrentUserId() in users:
                    users.append(getCurrentUserId())
                points = answer_browser_data.get('points', points)
                if points == "":
                    points = None
                timdb.answers.saveAnswer(users, task_id, json.dumps(save_object), points, tags, valid=True)

    return jsonResponse({'web': jsonresp['web']})


def get_hidden_name(user_id):
    return 'Undisclosed student %d' % user_id


def should_hide_name(doc_id, user_id):
    return not getTimDb().users.userIsOwner(user_id, doc_id) and user_id != getCurrentUserId()


@answers.route("/answers/<task_id>/<user_id>")
def get_answers(task_id, user_id):
    try:
        user_id = int(user_id)
    except ValueError:
        abort(404, 'Not a valid user id')
    verifyLoggedIn()
    timdb = getTimDb()
    doc_id, task_id_name = parse_task_id(task_id)
    if not timdb.documents.exists(doc_id):
        abort(404, 'No such document')
    user = timdb.users.getUser(user_id)
    if user_id != getCurrentUserId():
        verifyOwnership(doc_id)
    if user is None:
        abort(400, 'Non-existent user')
    user_answers = timdb.answers.getAnswers(user_id, task_id)
    if hide_names_in_teacher(doc_id):
        for answer in user_answers:
            for c in answer['collaborators']:
                if should_hide_name(doc_id, c['user_id']):
                    c['real_name'] = get_hidden_name(c['user_id'])
    return jsonResponse(user_answers)


@answers.route("/allAnswers/<task_id>")
def get__all_answers(task_id):
    verifyLoggedIn()
    timdb = getTimDb()
    doc_id, task_id_name = parse_task_id(task_id)
    usergroup = request.args.get('group')
    if not usergroup: usergroup = 0
    if not timdb.documents.exists(doc_id):
        abort(404, 'No such document')
    verifyOwnership(doc_id)
    all_answers = timdb.answers.get_all_answers(task_id, usergroup, hide_names_in_teacher(doc_id))
    return jsonResponse(all_answers)


@answers.route("/getState")
def get_state():
    timdb = getTimDb()
    doc_id, par_id, user_id, state = unpack_args('doc_id', 'par_id', 'user_id', 'state', types=[int, str, int, str])
    if not timdb.documents.exists(doc_id):
        abort(404, 'No such document')
    user = timdb.users.getUser(user_id)
    if user_id != getCurrentUserId():
        verifyOwnership(doc_id)
    if user is None:
        abort(400, 'Non-existent user')
    if not timdb.documents.exists(doc_id):
        abort(404, 'No such document')
    if not hasViewAccess(doc_id):
        abort(403, 'Permission denied')

    # version = request.headers['Version']
    doc = Document(doc_id)
    block = doc.get_paragraph(par_id)

    texts, js_paths, css_paths, modules = pluginControl.pluginify([block],
                                                                  user['name'],
                                                                  timdb.answers,
                                                                  user_id,
                                                                  custom_state=state,
                                                                  settings=doc.get_settings())
    return jsonResponse(texts[0])


@answers.route("/getTaskUsers/<task_id>")
def get_task_users(task_id):
    doc_id, task_id_name = parse_task_id(task_id)
    verifyOwnership(doc_id)
    usergroup = request.args.get('group')
    users = getTimDb().answers.get_users_by_taskid(task_id)
    if usergroup is not None:
        timdb = getTimDb()
        users = [user for user in users if timdb.users.isUserIdInGroup(user['id'], usergroup)]
    if hide_names_in_teacher(doc_id):
        for user in users:
            if should_hide_name(doc_id, user['id']):
                user['name'] = '-'
                user['real_name'] = get_hidden_name(user['id'])
    return jsonResponse(users)
