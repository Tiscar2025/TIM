import re
import langcodes

from flask import request, Blueprint
from sqlalchemy.exc import IntegrityError
from typing import Callable

from timApp.auth.accesshelper import (
    get_doc_or_abort,
    verify_view_access,
    verify_manage_access,
    has_manage_access,
    AccessDenied,
    verify_logged_in,
)
from timApp.auth.sessioninfo import get_current_user_object
from timApp.document.docentry import create_document_and_block, DocEntry
from timApp.document.documents import add_reference_pars
from timApp.document.translation.translation import Translation
from timApp.item.block import copy_default_rights, BlockType
from timApp.timdb.exceptions import ItemAlreadyExistsException
from timApp.timdb.sqa import db
from timApp.util.flask.requesthelper import verify_json_params, NotExist, RouteException
from timApp.util.flask.responsehelper import json_response, ok_response, Response
from timApp.util import logger
from timApp.document.translation.translator import (
    TranslationService,
    DeeplTranslationService,
    TranslationServiceKey,
)
from timApp.document.translation.language import Language


def valid_language_id(lang_id: str) -> bool:
    """Check that the id is recognized by the langcodes library."""
    try:
        tag = langcodes.standardize_tag(lang_id)
        lang = Language.query_by_code(tag)
        return lang is not None
    except langcodes.LanguageTagError:
        return False


def init_translate(
    translator: TranslationService,
    source_lang: Language,
    target_lang: Language,
) -> Callable[[list[str]], list[str]]:
    # TODO This helper-function would be better if there was some way to hide the translate-methods on ITranslators. Maybe save for the eventual(?) TranslatorSelector?
    """
    Use the specified TranslationService to initialize machine translation
    :param translator: The translator to use
    :param source_lang: The language that text is in
    :param target_lang: The language that text will be translated into
    :return: A partially applied function for translating text with the specified languages using the specified TranslationService
    """

    def generic_translate(text: list[str]) -> list[str]:
        """
        Wraps the TranslationService, source and target languages into a function that can be used to call a translation on different TranslationService-instances. TODO Maybe move this to TranslationService for clarity ":D"
        :param text: Pieces of text to translate
        :return: The input text translated according to the outer functions inputs.
        """
        translated_text = translator.translate(text, source_lang, target_lang)
        # TODO Maybe log the length of text or other shorter info?
        logger.log_info("\n".join(translated_text))

        usage = translator.usage()
        logger.log_info(
            "Current DeepL API usage: "
            + str(usage.character_count)
            + "/"
            + str(usage.character_limit)
        )

        return translated_text

    return generic_translate


def init_deepl_translate(
    source_lang: Language, target_lang: Language
) -> Callable[[list[str]], list[str]]:
    """
    Initialize the deepl translator using the API-key from user's configuration and return a partially applied function for translating
    :param source_lang: Language that is requested to translate from
    :param target_lang: Language that is requested to translate into
    :return: A function for translating text with the specified languages using a DeepLTranslator instance.
    """
    # Get the API-key from database
    # TODO Is this cool or should the service be its own class separate from the db model?
    translator = DeeplTranslationService.query.first()
    translator.register(get_current_user_object().get_personal_group())

    if not translator.supports(source_lang, target_lang):
        # TODO use langcodes for a friendlier error message (name + region/variant)
        raise RouteException(
            description=f"The language pair from '{source_lang}' to '{target_lang}' is not supported with DeepL"
        )

    translate_func: Callable[[list[str]], list[str]] = init_translate(
        translator, source_lang, target_lang
    )
    return translate_func


tr_bp = Blueprint("translation", __name__, url_prefix="")


@tr_bp.post("/translate/<int:tr_doc_id>/<language>")
def create_translation_route(tr_doc_id, language):
    req_data = request.get_json()
    title = req_data.get("doc_title", None)

    doc = get_doc_or_abort(tr_doc_id)

    verify_view_access(doc)
    if not valid_language_id(language):
        raise NotExist("Invalid language identifier")
    if doc.has_translation(language):
        raise ItemAlreadyExistsException("Translation for this language already exists")
    verify_manage_access(doc.src_doc)

    # NOTE Failing to create the translation still increases document id number and sometimes the manage page gets stuck (because of it?)
    src_doc = doc.src_doc.document
    cite_doc = create_document_and_block(get_current_user_object().get_personal_group())

    tr = Translation(doc_id=cite_doc.doc_id, src_docid=src_doc.doc_id, lang_id=language)
    tr.title = title

    add_reference_pars(cite_doc, src_doc, "tr")

    # Select the specified translator
    translator_func = None
    if translator_code := req_data.get("autotranslate", None):
        # Use the translator with a different source language if specified
        # and get the actual Language objects from database TODO Is database-query dumb here?
        src_lang = Language.query_by_code(
            # TODO is it necessary to send the origlang parameter?
            req_data.get("origlang", src_doc.docinfo.lang_id)
        )
        if not src_lang:
            raise RouteException(description="The source language is not set.")

        tr_lang = Language.query_by_code(req_data.get("translatorlang", language))

        # Select the translator TODO Maybe move to somewhere else so this does not blow up with if-else?
        if translator_code.lower() == "deepl":
            translator_func = init_deepl_translate(src_lang, tr_lang)

    # Translate each paragraph sequentially if a translator was created
    if translator_func:
        zipped_paragraphs = list(
            zip(tr.document.get_source_document().get_paragraphs(), tr.document)
        )
        # HACK Skip first paragraph to protect settings-block from mangling
        for orig_paragraph, tr_block in zipped_paragraphs[1:]:
            # Call the partially applied function, that contains languages selected earlier, to translate text
            # TODO Call with the whole document and let preprocessing handle the conversion into list[str]?
            translated_text = translator_func([orig_paragraph.md])[0]
            tr.document.modify_paragraph(tr_block.id, translated_text)

    if isinstance(doc, DocEntry):
        de = doc
    elif isinstance(doc, Translation):
        de = doc.docentry
    else:
        assert False, "doc has unexpected type"
    de.trs.append(tr)
    copy_default_rights(tr, BlockType.Document)
    db.session.commit()
    return json_response(tr)


@tr_bp.post("/translate/<int:tr_doc_id>/<language>/translate_block")
def text_translation_route(tr_doc_id: int, language: str) -> Response:
    req_data = request.get_json()

    doc = get_doc_or_abort(tr_doc_id)

    verify_view_access(doc)
    verify_manage_access(doc.src_doc)

    src_doc = doc.src_doc.document

    # Select the specified translator and translate if valid
    if req_data and (translator_code := req_data.get("autotranslate", None)):
        src_text = req_data.get("originaltext", None)
        if translator_code.lower() == "deepl":
            src_lang = Language.query_by_code(src_doc.docinfo.lang_id)
            target_lang = Language.query_by_code(language)
            translator_func = init_deepl_translate(src_lang, target_lang)
            block_text = translator_func([src_text])[0]
    else:
        raise RouteException(
            description=f"Please select a translator from the 'Translator data' tab"
        )

    return json_response(block_text)


@tr_bp.post("/translation/<int:doc_id>")
def update_translation(doc_id):
    (lang_id, doc_title) = verify_json_params("new_langid", "new_title", require=True)
    if not valid_language_id(lang_id):
        raise AccessDenied("Invalid language identifier")
    doc = get_doc_or_abort(doc_id)
    if not has_manage_access(doc) and not has_manage_access(doc):
        raise AccessDenied(
            "You need manage access of either this or the translated document"
        )
    doc.lang_id = lang_id
    doc.title = doc_title
    try:
        db.session.commit()
    except IntegrityError:
        raise ItemAlreadyExistsException("This language already exists.")
    return ok_response()


@tr_bp.get("/translations/<int:doc_id>")
def get_translations(doc_id: int) -> Response:
    d = get_doc_or_abort(doc_id)
    verify_manage_access(d)

    return json_response(d.translations)


@tr_bp.get("/translations/source-languages")
def get_source_languages() -> Response:
    """
    Query the database for the possible source languages.
    TODO Select by translator
    """

    langs = Language.query.all()
    sl = list(map(lambda x: f"{x.autonym}-{x.lang_code}", langs))
    return json_response(sl)


@tr_bp.get("/translations/document-languages")
def get_document_languages() -> Response:
    """
    Query the database for the languages of existing documents.
    TODO Select from documents
    """

    langs = Language.query.all()
    sl = list(map(lambda x: f"{x.autonym}-{x.lang_code}", langs))
    return json_response(sl)


@tr_bp.get("/translations/target-languages")
def get_target_languages() -> Response:
    """
    Query the database for the possible target languages.
    TODO Select by translator
    """

    langs = Language.query.all()
    sl = list(map(lambda x: f"{x.autonym}-{x.lang_code}", langs))
    return json_response(sl)


@tr_bp.get("/translations/translators")
def get_translators() -> Response:
    """
    Query the database for the possible machine translators.
    """

    translationservices = TranslationService.query.all()
    translationservice_names = list(map(lambda x: x.service_name, translationservices))
    sl = ["Manual"] + translationservice_names
    return json_response(sl)


@tr_bp.post("apikeys/add")
def add_api_key() -> Response:
    """
    The function for adding API keys.
    """

    req_data = request.get_json()
    translator = req_data.get("translator", "")
    key = req_data.get("apikey", "")

    tr = TranslationService.query.filter(
        translator == TranslationService.service_name
    ).first()

    verify_logged_in()
    user = get_current_user_object()
    duplicate = TranslationServiceKey.query.filter(
        tr.id == TranslationServiceKey.service_id,
        user.get_personal_group().id == TranslationServiceKey.group_id,
    ).first()
    if duplicate:
        raise RouteException("There is already a key for this translator for this user")

    # Add the new API key
    new_key = TranslationServiceKey(
        api_key=key,
        group_id=user.get_personal_group().id,
        service_id=tr.id,
    )
    db.session.add(new_key)
    db.session.commit()
    return ok_response()


@tr_bp.post("apikeys/remove")
def remove_api_key() -> Response:
    """
    The function for removing API keys.
    """

    verify_logged_in()
    user = get_current_user_object()

    req_data = request.get_json()
    translator = req_data.get("translator", "")
    key = req_data.get("apikey", "")

    to_be_removed = TranslationServiceKey.query.filter(
        key == TranslationServiceKey.api_key,
        TranslationServiceKey.group_id == user.get_personal_group().id,
        translator == TranslationService.service_name,
    ).first()

    if not to_be_removed:
        raise RouteException("The key does not exist for the user")

    db.session.delete(to_be_removed)
    db.session.commit()
    return ok_response()


@tr_bp.post("/apikeys/quota")
def get_quota():
    verify_logged_in()

    req_data = request.get_json()
    translator = req_data.get("translator", "")
    key = req_data.get("apikey", "")

    # Get the translation service by the provided service name TODO Maybe change to use id instead?
    tr = TranslationService.query.filter(
        translator == TranslationService.service_name,
    ).first()
    tr.register(get_current_user_object().get_personal_group())

    return json_response(tr.usage())


@tr_bp.get("/apikeys/get")
def get_keys() -> Response:
    verify_logged_in()

    user = get_current_user_object()
    keys = TranslationServiceKey.query.filter(
        TranslationServiceKey.group_id == user.get_personal_group().id
    ).all()

    result = []
    for x in keys:
        result.append(
            {
                "translator": x.service.service_name,
                "APIkey": x.api_key,
            }
        )

    return json_response(result)
