import {IScope} from "angular";
import $ from "jquery";
import {Moment} from "moment";
import {showMessageDialog} from "../../dialog";
import {openEditor} from "../../directives/pareditor";
import {IExtraData, IParResponse} from "../../edittypes";
import {$compile, $http, $window} from "../../ngimport";
import {IPluginInfoResponse} from "../../services/parCompiler";
import {getElementParent, to} from "../../utils";
import {getActiveDocument} from "./document";
import {EditPosition, EditType} from "./editing";
import {onClick} from "./eventhandlers";
import {addElementToParagraphMargin, getFirstParId, isActionablePar, Paragraph, ParOrArea} from "./parhelpers";
import {markParRead, readingTypes} from "./readings";
import {ViewCtrl} from "./viewctrl";

export interface INoteEditorOptions {
    noteData?: {id: string};
    showDelete?: boolean;
}

export interface INote {
    id: number;
    doc_id: number;
    par_id: string;
    par_hash: string;
    content: string;
    created: Moment;
    modified?: Moment;
    access: "everyone" | "justme";
    html: string;
    tags: string[];
}

export class NotesHandler {
    public sc: IScope;
    public viewctrl: ViewCtrl;
    public noteBadgePar: JQuery;
    public noteBadge: HTMLElement;

    constructor(sc: IScope, view: ViewCtrl) {
        this.sc = sc;
        this.viewctrl = view;
        onClick(".note", ($this, e) => {
            if (!$this.hasClass("editable")) {
                return false;
            }
            const id = $this.attr("note-id");
            if (!id) {
                showMessageDialog("Cannot edit this note; missing id attribute.");
                return;
            }
            this.toggleNoteEditor($this.parents(".par"), {noteData: {id: id}});
            return true;
        });
    }

    async toggleNoteEditor($parOrArea: ParOrArea, options: INoteEditorOptions = {}) {
        let caption = "Edit comment";
        const touch = typeof ("ontouchstart" in window || navigator.msMaxTouchPoints) !== "undefined";
        const mobile = touch && (window.screen.width < 1200);
        if (!this.viewctrl.item.rights.can_comment) {
            return;
        }
        const parId = getFirstParId($parOrArea);
        if (!parId) {
            return;
        }
        let url: string;
        let data;
        let initialText = "";
        if (!options.noteData) {
            caption = "Add comment";
            url = "/postNote";
            data = {
                access: this.viewctrl.$storage.noteAccess,
                tags: {
                    markread: false,
                },
            };
        } else {
            url = "/editNote";
            const notedata = (await $http.get<{text: string, extraData: INote}>("/note/" + options.noteData.id)).data;
            initialText = notedata.text;
            data = {
                id: options.noteData.id,
                access: notedata.extraData.access, tags: {
                    markread: false,
                },
            };
        }

        const extraData: IExtraData = {
            docId: this.viewctrl.docId,
            isComment: true,
            par: parId,
            ...data,
        };
        const params: EditPosition = {type: EditType.Edit, pars: $parOrArea};
        const result = await openEditor({
            extraData,
            initialText,
            options: {
                caption,
                localSaveTag: "note",
                showDelete: !!options.noteData,
                showImageUpload: true,
                showSettings: false,
                tags: [],
                showPlugins: false,
                touchDevice: mobile,
                choices: [{
                    desc: "Show note to:",
                    name: "access",
                    opts: [
                        {desc: "Everyone", value: "everyone"},
                        {desc: "Just me", value: "justme"},
                    ],
                }],
            },
            deleteCb: async () => {
                const [err, resp] = await to($http.post<IParResponse>(`/deleteNote`, extraData));
                if (err) {
                    return {error: err.data.error};
                } else if (resp) {
                    this.viewctrl.editingHandler.addSavedParToDom(resp.data, params);
                }
                return {};
            },
            previewCb: async (text) => (await $http.post<IPluginInfoResponse>(`/preview/${this.viewctrl.docId}`, {text, ...extraData})).data,
            saveCb: async (text, eData) => {
                const [err, resp] = await to($http.post<IParResponse>(url, {text, ...eData}));
                if (err) {
                    return {error: err.data.error};
                } else if (resp) {
                    this.viewctrl.editingHandler.addSavedParToDom(resp.data, params);
                }
                return {};
            },
            unreadCb: async () => {
                if (params.type !== EditType.Edit) {
                    return;
                }
                await $http.post(`/unread/${this.viewctrl.docId}/${extraData.par}`, {});
                params.pars.first().find(".readline").removeClass("read read-modified");
                getActiveDocument().refreshSectionReadMarks();
            },
        });
    }

    showNoteWindow(e: Event, $par: Paragraph) {
        this.toggleNoteEditor($par);
    }

    /**
     * Creates the note badge button (the button with letter 'C' on it).
     * @method createNoteBadge
     * @param $par - Element where the badge needs to be attached
     */
    createNoteBadge($par: Paragraph) {
        this.noteBadgePar = $par;
        if (this.noteBadge) {
            //var parent = getElementParent(sc.noteBadge);
            //if ( !parent ) $compile(sc.noteBadge)(sc);
            return this.noteBadge;
        }

        const btn = document.createElement("input");
        btn.type = "button";
        btn.classList.add("note-badge");
        if ($window.velpMode)
            btn.classList.add("note-badge-with-velp");
        btn.classList.add("timButton");
        btn.value = "C";
        btn.title = "Add comment/note";
        btn.id = "noteBadge";
        this.noteBadge = btn;
        // btn.setAttribute("ng-click", "addNote()");
        btn.onclick = ($event) => {
            $event.stopPropagation();
            this.toggleNoteEditor(this.noteBadgePar);
        };
        $compile(btn)(this.sc);
        return btn;
    }

    addNote() {
        // sc.clearNoteBadge(null);
        this.toggleNoteEditor(this.noteBadgePar);
    }

    setNotePadge($event: Event) {
        $event.stopPropagation();
        let $par = $($event.target);
        if (!$par.hasClass("par")) $par = $par.parents(".par");
        this.updateNoteBadge($par);
    }

    /**
     * Moves the note badge to the correct element.
     * @method updateNoteBadge
     * @param $par - Element where the badge needs to be attached
     */
    updateNoteBadge($par: Paragraph) {
        if (!$par) return;
        if (!isActionablePar($par)) {
            return;
        }
        if ($par.parents(".previewcontent").length > 0) {
            return;
        }
        markParRead($par, readingTypes.clickPar);
        const newElement = $par[0];
        if (!newElement) return;
        addElementToParagraphMargin(newElement, this.createNoteBadge($par));
    }

    /**
     * Removes the note badge and clears the element selection.
     * @param e - Current click event
     */
    clearNoteBadge(e: Event) {
        const btn = this.noteBadge;
        if (btn) {
            const parent = getElementParent(btn);
            if (parent) parent.removeChild(btn);
        }

        if (e != null) {
            e.stopPropagation();
        }
    }
}
