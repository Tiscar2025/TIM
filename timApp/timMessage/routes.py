from dataclasses import dataclass
import datetime

from flask import Response

from timApp.util.flask.responsehelper import ok_response, json_response
from timApp.util.flask.typedblueprint import TypedBlueprint

timMessage = TypedBlueprint('timMessage', __name__, url_prefix='/timMessage')

@dataclass
class MessageOptions:
    #Options regarding TIM messages
    archive: bool
    check: bool
    reply: bool
    replyAll: bool
    #expires: <type here>

@timMessage.route("/send", methods=['POST'])
def send_tim_message(options: MessageOptions) -> Response:
    #TODO: actual logic, this is just a placeholder
    print(options)
    return ok_response()