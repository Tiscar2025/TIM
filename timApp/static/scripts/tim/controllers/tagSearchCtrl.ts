/***
 * Controller and HTML template for tag search dialog.
 */

import {IRootElementService, IScope} from "angular";
import * as focusMe from "tim/directives/focusMe";
import {DialogController, registerDialogComponent, showDialog} from "../dialog";
import {IItem} from "../IItem";
import {markAsUsed} from "../utils";

markAsUsed(focusMe);

/*
 * Tag search dialog's controller.
 */
export class ShowTagSearchController extends DialogController<{ params: IItem }, {}, "timSearchTags"> {
    private static $inject = ["$element", "$scope"];
    private enableSearch = true;
    private header = "";

    constructor(protected element: IRootElementService, protected scope: IScope) {
        super(element, scope);
    }

    /*
     * Show tag list when dialog loads and focus on tag-field.
     */
    async $onInit() {
        super.$onInit();
        if (this.enableSearch) {
            this.header = "Input a tag name to search documents";
        }
    }

    /*
     * Dialog title.
     */
    public getTitle() {
        return "Tag search";
    }

}

registerDialogComponent("timSearchTags",
    ShowTagSearchController,
    {
        template:
            `<tim-dialog class="overflow-visible">
    <dialog-header>
    </dialog-header>
    <dialog-body>
        <h4>{{$ctrl.header}}</h4>
        <tagged-document-list enable-search="$ctrl.enableSearch" tag-filter="" exact-match="false"
                              list-doc-tags="true"></tagged-document-list>
        <button class="btn timButton" ng-click="$ctrl.dismiss()"><span>Close</span></button>
    </dialog-body>
    <dialog-footer>
    </dialog-footer>
</tim-dialog>
`,
    });

export async function showTagSearchDialog(d: IItem) {
    return await showDialog<ShowTagSearchController>("timSearchTags", {params: () => d}).result;
}
