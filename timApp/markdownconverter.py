"""Provides functions for converting markdown-formatted text to HTML."""
from contracts import contract
import re

from dumboclient import call_dumbo
from htmlSanitize import sanitize_html
from jinja2 import Environment


def expand_macros_regex(text, macros, macro_delimiter=None):
    if macro_delimiter is None:
        return text
    return re.sub('{0}([a-zA-Z]+){0}'.format(re.escape(macro_delimiter)),
                  lambda match: macros.get(match.group(1), 'UNKNOWN MACRO: ' + match.group(1)),
                  text)


def expand_macros_jinja2(text, macros, macro_delimiter=None):
    if macro_delimiter is None:
        return text
    env = Environment(variable_start_string=macro_delimiter,
                      variable_end_string=macro_delimiter,
                      comment_start_string='{#',
                      comment_end_string='#}',
                      block_start_string='{%',
                      block_end_string='%}',
                      lstrip_blocks=True,
                      trim_blocks=True)
    return env.from_string(text).render(macros)


expand_macros = expand_macros_jinja2


@contract
def md_to_html(text: str, sanitize: bool=True, macros: 'dict(str:str)|None'=None, macro_delimiter=None) -> str:
    """
    Converts the specified markdown text to HTML.

    :param sanitize: Whether the HTML should be sanitized. Default is True.
    :type text: str
    :param text: The text to be converted.
    """

    text = expand_macros(text, macros, macro_delimiter)

    raw = call_dumbo([text])
    if sanitize:
        return sanitize_html(raw[0])
    else:
        return raw[0]


@contract
def md_list_to_html_list(texts: 'list(str)',
                         sanitize: bool=True,
                         macros: 'dict(str:str)|None'=None,
                         macro_delimiter=None) -> 'list(str)':
    """
    Converts the specified list of markdown texts to an HTML list.

    :param sanitize: Whether the HTML should be sanitized. Default is True.
    :type texts: list[str]
    :param texts: The list of markdown texts to be converted.
    """

    texts = [expand_macros(text, macros, macro_delimiter) for text in texts]

    raw = call_dumbo(texts)
    if sanitize:
        return [sanitize_html(p) for p in raw]
    else:
        return raw
