"""
TIM plugin: a textfield
"""
from typing import Union

import attr
from flask import jsonify, render_template_string
from marshmallow import Schema, fields, post_load, validates, ValidationError
from marshmallow.utils import missing
from webargs.flaskparser import use_args

from pluginserver_flask import GenericMarkupModel, GenericMarkupSchema, GenericHtmlSchema, GenericHtmlModel, \
    GenericAnswerSchema, GenericAnswerModel, Missing, \
    InfoSchema, create_app


@attr.s(auto_attribs=True)
class TextfieldStateModel:
    """Model for the information that is stored in TIM database for each answer."""
    userword: str


class TextfieldStateSchema(Schema):
    userword = fields.Str(required=True)

    @post_load
    def make_obj(self, data):
        return TextfieldStateModel(**data)

    class Meta:
        strict = True


@attr.s(auto_attribs=True)
class TextfieldMarkupModel(GenericMarkupModel):
    points_array: Union[str, Missing] = missing
    inputstem: Union[str, Missing] = missing
    initword: Union[str, Missing] = missing
    cols: Union[int, Missing] = missing
    inputplaceholder: Union[str, Missing] = missing
    followid: Union[str, Missing] = missing
    autosave: Union[bool, Missing] = missing
    inputchecker: Union[str, Missing] = missing


class TextfieldMarkupSchema(GenericMarkupSchema):
    points_array = fields.List(fields.List(fields.Number()))
    header = fields.String(allow_none=True)
    inputstem = fields.String(allow_none=True)
    stem = fields.String(allow_none=True)
    initword = fields.String(allow_none=True)
    cols = fields.Int()
    inputplaceholder: Union[str, Missing] = missing
    followid = fields.String(allow_none=True)
    autosave = fields.Boolean()
    #inputchecker = fields.String(allow_none=True)

    @post_load
    def make_obj(self, data):
        return TextfieldMarkupModel(**data)

    class Meta:
        strict = True


@attr.s(auto_attribs=True)
class TextfieldInputModel:
    """Model for the information that is sent from browser (plugin AngularJS component)."""
    userword: str
    nosave: bool = missing


class TextfieldInputSchema(Schema):
    userword = fields.Str(required=True)
    nosave = fields.Bool()

    @validates('userword')
    def validate_userword(self, word):
        pass

    @post_load
    def make_obj(self, data):
        return TextfieldInputModel(**data)


class TextfieldAttrs(Schema):
    """Common fields for HTML and answer routes."""
    markup = fields.Nested(TextfieldMarkupSchema)
    state = fields.Nested(TextfieldStateSchema, allow_none=True, required=True)

    class Meta:
        strict = True


@attr.s(auto_attribs=True)
class TextfieldHtmlModel(GenericHtmlModel[TextfieldInputModel, TextfieldMarkupModel, TextfieldStateModel]):
    def get_component_html_name(self) -> str:
        return 'textfield-runner'

    def get_static_html(self) -> str:
        return render_static_textfield(self)

    def get_browser_json(self):
        r = super().get_browser_json()
        if self.state:
            r['userword'] = self.state.userword
        return r

    class Meta:
        strict = True


class TextfieldHtmlSchema(TextfieldAttrs, GenericHtmlSchema):
    info = fields.Nested(InfoSchema, allow_none=True, required=True)

    @post_load
    def make_obj(self, data):
        # noinspection PyArgumentList
        return TextfieldHtmlModel(**data)

    class Meta:
        strict = True


@attr.s(auto_attribs=True)
class TextfieldAnswerModel(GenericAnswerModel[TextfieldInputModel, TextfieldMarkupModel, TextfieldStateModel]):
    pass


class TextfieldAnswerSchema(TextfieldAttrs, GenericAnswerSchema):
    input = fields.Nested(TextfieldInputSchema, required=True)

    @post_load
    def make_obj(self, data):
        # noinspection PyArgumentList
        return TextfieldAnswerModel(**data)

    class Meta:
        strict = True


def render_static_textfield(m: TextfieldHtmlModel):
    return render_template_string(
        """
<div class="csRunDiv no-popup-menu">
    <h4>{{ header }}</h4>
    <p class="stem">{{ stem }}</p>
    <div><label>{{ inputstem or '' }} <span>
        <input type="text"
               class="form-control"
               placeholder="{{inputplaceholder}}"
               size="{{cols}}"></span></label>
    </div>
    <button class="timButton">
        {{ buttonText or button or "Save" }}
    </button>
    <a>{{ resetText }}</a>
    <p class="plgfooter">{{ footer }}</p>
</div>
        """,
        **attr.asdict(m.markup),
    )


app = create_app(__name__, TextfieldHtmlSchema())


@app.route('/answer/', methods=['put'])
@use_args(TextfieldAnswerSchema(strict=True), locations=("json",))
def answer(args: TextfieldAnswerModel):
    web = {}
    result = {'web': web}
    userword = args.input.userword

    nosave = args.input.nosave

    if not nosave:
        save = {"userword": userword}
        result["save"] = save
        web['result'] = "saved"

    return jsonify(result)


@app.route('/reqs/')
@app.route('/reqs')
def reqs():
    """Introducing templates for textfield plugin"""
    templates = ["""
``` {#textfield_normal plugin="textfield"}
needed_len: 1 #MINIMIPITUUS, NUMERAALINEN
cols: 1 #KENTÄN KOKO, NUMERAALINEN
autosave: true #AUTOSAVE, PÄÄLLÄ
```""", """
``` {#textfield_extended plugin="textfield"}
header: #OTSIKKO, TYHJÄ = EI OTSIKKOA
stem: #KYSYMYS, TYHJÄ = EI KYSYMYSTÄ
inputstem: #VASTAUS, TYHJÄ = EI VASTAUSTA
followid: #SEURANTAID, TYHJÄ = EI SEURANTAID:tä
needed_len: 1 #MINIMIPITUUS, NUMERAALINEN 
initword: #ALKUARVO, TYHJÄ = EI ALKUARVOA
buttonText: Save #PAINIKKEEN NIMI, TYHJÄ = EI PAINIKETTA
cols: 1 #KENTÄN KOKO, NUMERAALINEN
autosave: false #AUTOSAVE, POIS PÄÄLTÄ
inputchecker: ^hyv$|^hyl$|^1$|^2$|^3$|^4$|^5$ #KÄYTTÄJÄSYÖTTEEN RAJOITIN, TYHJÄ = EI RAJOITUSTA
```""", """
``` {#label plugin="textfield" readonly=view}
followid: #SEURANTAID, TYHJÄ = EI SEURANTAID:tä
needed_len: 1 #MINIMIPITUUS, NUMERAALINEN 
initword: #ALKUARVO, TYHJÄ = EI ALKUARVOA
cols: 1 #KENTÄN KOKO, NUMERAALINEN
autosave: false #AUTOSAVE, POIS PÄÄLTÄ
```"""
]
    return jsonify({
        "js": ["js/build/textfield.js"],
        "multihtml": True,
        "css": ["css/textfield.css"],
        'editor_tabs': [
            {
                'text': 'Plugins',
                'items': [
                    {
                        'text': 'Textfield',
                        'items': [
                            {
                                'data': templates[0].strip(),
                                'text': 'Tekstikenttä (autosave)',
                                'expl': 'Luo kenttä jonka syötteet ovat tekstiä',
                            },
                            {
                                'data': templates[1].strip(),
                                'text': 'Tekstikenttä (laajennettu)',
                                'expl': 'Luo kenttä jonka syötteet ovat tekstiä',
                            },
                            {
                                'data': templates[2].strip(),
                                'text': 'Label kenttä (read only)',
                                'expl': 'Luo kenttä jonka syötteitä käyttäjä ei voi muokata',
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
