import re
from pathlib import Path
from typing import Any, Optional, Dict


def _jsonify(value: Any) -> str:
    import json

    return json.dumps(value)


def _partial(dir_path: str, name: str) -> str:
    templates_path = Path.cwd() / dir_path
    template = templates_path / name
    return template.read_text()


class PyTemplate:
    delimiter = "$"
    idpattern = r"[^}]*"  # Note: this does not allow inserting {}s into the templates themselves
    flags = re.IGNORECASE

    def __init_subclass__(cls):
        super().__init_subclass__()
        if "pattern" in cls.__dict__:
            pattern = cls.pattern
        else:
            delim = re.escape(cls.delimiter)
            bid = cls.idpattern
            pattern = rf"""
            {delim}(?:
              (?P<escaped>{delim})  |   # Escape sequence of two delimiters
              {{(?P<braced>{bid})}} |   # delimiter and a braced identifier
              (?P<invalid>)             # Other ill-formed delimiter exprs
            )
            """
        cls.pattern = re.compile(pattern, cls.flags | re.VERBOSE)

    def __init__(self, template):
        self.template = template

    def render(self, ctx: Optional[Dict[str, Any]] = None) -> str:
        if ctx is None:
            ctx = {}

        ctx = {
            **ctx,
            "jsonify": _jsonify,
            "partial": _partial,
        }

        def convert(mo):
            named = mo.group("braced")
            if named is not None:
                try:
                    return eval(named, ctx)
                except (NameError, SyntaxError):
                    return mo.group()
            if mo.group("escaped") is not None:
                return self.delimiter
            if mo.group("invalid") is not None:
                return mo.group()
            raise ValueError("Unrecognized named group in pattern", self.pattern)

        return self.pattern.sub(convert, self.template)


PyTemplate.__init_subclass__()
