from flask import Blueprint
from .common import *

annotations = Blueprint('annotations',
                        __name__,
                        url_prefix='')


# TODO connect the routes in this file to the ui.
@annotations.route("/addannotation", methods=['POST'])
def add_annotation() -> str:
    json_data = request.get_json()
    print(json_data)
    timdb = getTimDb()

    # first get the non-optional arguments and abort if there is missing data.
    try:
        velp_id = json_data['velp']
        visible_to = timdb.annotations.AnnotationVisibility(json_data['visible_to'])
        document_id = json_data['doc_id']
        coordinates = json_data['coord']
        start = coordinates['start']
        end = coordinates['end']

        offset_start = start['offset']
        element_path_start = start['el_path']
        if type(element_path_start) is not list:
            raise TypeError(str(element_path_start))
        if any(type(i) is not int for i in element_path_start):
            raise TypeError(str(element_path_start))
        element_path_start = str(element_path_start)

        offset_end = end['offset']
        element_path_end = end['el_path']
        if type(element_path_end) is not list:
            raise TypeError(str(element_path_end))
        if any(type(i) is not int for i in element_path_end):
            raise TypeError(str(element_path_end))
        element_path_end = str(element_path_end)

    except KeyError as e:  # one of the json_data['foo'] fails
        abort(400, "Missing data: " + e.args[0])
    except TypeError as e:  # one of the element paths is not a list of integers
        abort(400, "Malformed element path. " + e.args[0])
    except ValueError as e:  # visible_to could not be casted to the enum used.
        abort(400, e.args[0])

    # .get() returns None if there is no data instead of throwing.
    points = json_data.get('points')
    icon_id = json_data.get('icon_id')

    # Now ensure that the data is good for either an answer or a paragraph target.
    answer_id = json_data.get('answer_id')
    if answer_id is None:
        try:
            paragraph_id_start = start['par_id']
            hash_start = start['t']
            paragraph_id_end = end['par_id']
            hash_end = end['t']
        except KeyError as e:
            abort(400, "Missing data: " + e.args[0])
    else:
        paragraph_id_start = start.get('par_id')
        hash_start = start.get('t')
        paragraph_id_end = end.get('par_id')
        hash_end = start.get('t')
        some_paragraph_data_present = paragraph_id_start is not None
        some_paragraph_data_present = hash_start is not None or some_paragraph_data_present
        some_paragraph_data_present = paragraph_id_end is not None or some_paragraph_data_present
        some_paragraph_data_present = hash_end is not None or some_paragraph_data_present
        if some_paragraph_data_present:
            abort(400, "Both answer_id and paragraph data present.")

    annotator_id = getCurrentUserId()
    velp_version = timdb.velps.get_latest_velp_version(velp_id)
    new_id = timdb.annotations.create_annotation(velp_version, visible_to, points, annotator_id, document_id,
                                                 paragraph_id_start, paragraph_id_end, offset_start, offset_end,
                                                 hash_start, hash_end, element_path_start, element_path_end, None,
                                                 icon_id, answer_id)
    return jsonResponse(new_id)


@annotations.route("/addannotationcomment", methods=['POST'])
def add_comment() -> str:
    json_data = request.get_json()
    try:
        annotation_id = json_data['annotation_id']
        content = json_data['content']
    except KeyError as e:
        abort(400, "Missing data: " + e.args[0])
    # Todo maybe check that content isn't an empty string
    timdb = getTimDb()
    commenter_id = getCurrentUserId()
    new_id = timdb.annotations.add_comment(annotation_id, commenter_id, content)
    return jsonResponse(new_id)


# Todo maybe check that the document in question actually exists and return on error if not.
@annotations.route("/<document_id>/annotations", methods=['GET'])
def get_annotations(document_id: int) -> str:
    timdb = getTimDb()
    user_id = getCurrentUserId()
    if not timdb.users.has_view_access(user_id,document_id):
        abort(403)
    user_teacher = timdb.users.has_teacher_access(user_id,document_id)
    user_owner = timdb.users.user_is_owner(user_id,document_id)
    results = timdb.annotations.get_annotations_in_document(getCurrentUserId(), user_teacher, user_owner, int(document_id))
    return jsonResponse(results)


# TODO decide whether we should instead return comments for just one annotation, instead of returning everything at
# once, like here.
# Todo maybe check that the document in question actually exists and return on error if not.
@annotations.route("/<document_id>/comments", methods=['GET'])
def get_comments(document_id: int) -> str:
    timdb = getTimDb()
    results = timdb.annotations_comments.get_comments(int(document_id))
    return jsonResponse(results)
