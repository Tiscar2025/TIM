"""
A button plugin to save other plugins on the same page
"""
from typing import Union, List

import attr
from flask import jsonify, render_template_string
from marshmallow import Schema, fields, post_load
from marshmallow.utils import missing
from pluginserver_flask import GenericMarkupModel, GenericMarkupSchema, GenericHtmlSchema, GenericHtmlModel, \
    Missing, \
    InfoSchema, create_app


# @attr.s(auto_attribs=True)
class MultisaveStateModel:
    """Model for the information that is stored in TIM database for each answer."""
    #userword: str


# class multisaveStateSchema(Schema):
#     #userword = fields.Str(required=True)
#
#     @post_load
#     def make_obj(self, data):
#         return MultisaveStateModel(**data)
#
#     class Meta:
#         strict = True


@attr.s(auto_attribs=True)
class MultisaveMarkupModel(GenericMarkupModel):
    areas: Union[List[str], Missing] = missing
    fields: Union[List[str], Missing] = missing


class MultisaveMarkupSchema(GenericMarkupSchema):
    areas = fields.List(fields.Str())
    fields = fields.List(fields.Str())

    @post_load
    def make_obj(self, data):
        return MultisaveMarkupModel(**data)

    class Meta:
        strict = True


@attr.s(auto_attribs=True)
class MultisaveInputModel:
    """Model for the information that is sent from browser (plugin AngularJS component)."""
    ##userword: str
    ##multisaveOK: bool = missing
    ##nosave: bool = missing


# class MultisaveInputSchema(Schema):
#     @post_load
#     def make_obj(self, data):
#         return MultisaveInputModel(**data)


class MultisaveAttrs(Schema):
    """Common fields for HTML and answer routes."""
    markup = fields.Nested(MultisaveMarkupSchema)
    # state = fields.Nested(multisaveStateSchema, allow_none=True, required=True)

    class Meta:
        strict = True


@attr.s(auto_attribs=True)
class MultisaveHtmlModel(GenericHtmlModel[MultisaveInputModel, MultisaveMarkupModel, MultisaveStateModel]):

    def get_component_html_name(self) -> str:
        return 'multisave-runner'

    def get_static_html(self) -> str:
        return render_static_multisave(self)

    def get_browser_json(self):
        r = super().get_browser_json()
        return r

    class Meta:
        strict = True


class MultisaveHtmlSchema(MultisaveAttrs, GenericHtmlSchema):
    info = fields.Nested(InfoSchema, allow_none=True, required=True)

    @post_load
    def make_obj(self, data):
        # noinspection PyArgumentList
        return MultisaveHtmlModel(**data)

    class Meta:
        strict = True


def render_static_multisave(m: MultisaveHtmlModel):
    return render_template_string("""
<div>
<button class="timButton">
{{ buttonText or button or "Save" }}
</button>
</div>""".strip(),
        **attr.asdict(m.markup),
    )


app = create_app(__name__, MultisaveHtmlSchema())

@app.route('/reqs/')
@app.route('/reqs')
def reqs():
    templates = ["""
``` {plugin="multisave"}
```""", """
``` {plugin="multisave"}
areas:
- 
```""", """
``` {plugin="multisave"}
fields:
- 
```"""]
    return jsonify({
        "js": ["js/build/multisave.js"],
        "multihtml": True,
        "css": ["css/multisave.css"],
        'editor_tabs': [
            {
                'text': 'Plugins',
                'items': [
                    {
                        'text': 'Multisave',
                        'items': [
                            {
                                'data': templates[0].strip(),
                                'text': 'Multisave for entire document',
                                'expl': 'Multisave for entire document',
                            },
                            {
                                'data': templates[1].strip(),
                                'text': 'Multisave for areas',
                                'expl': 'Multisave for areas',
                            },
                            {
                                'data': templates[2].strip(),
                                'text': 'Multisave for specific IDs',
                                'expl': 'Multisave for specific IDs',
                            },
                        ],
                    },
                ],
            },
        ],
    },
    )


if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False,  # for live reloading, this can be turned on
    )
