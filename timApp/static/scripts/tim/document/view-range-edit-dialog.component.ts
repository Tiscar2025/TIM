/**
 * Dialog showing view range options.
 */

import {AngularDialogComponent} from "tim/ui/angulardialog/angular-dialog-component.directive";
import {Component, NgModule} from "@angular/core";
import {ngStorage} from "ngstorage";
import {DialogModule} from "tim/ui/angulardialog/dialog.module";
import {FormsModule} from "@angular/forms";
import {BrowserModule} from "@angular/platform-browser";
import {IItem} from "../item/IItem";
import {$localStorage} from "../util/ngimport";
import {TimUtilityModule} from "../ui/tim-utility.module";
import {
    getCurrentPartitionURLParams,
    getPieceSize,
    getViewRange,
    partitionDocument,
    setPieceSize,
    unpartitionDocument,
} from "./viewRangeInfo";

@Component({
    selector: "tim-view-range-edit-dialog",
    template: `
        <tim-dialog-frame class="overflow-visible">
            <ng-container header>
                {{ getTitle() }}
            </ng-container>
            <ng-container body>
                <div>
                    <p>Toggle showing documents in smaller parts and edit the number of paragraphs shown per part.</p>
                    <div class="checkbox">
                        <label><input type="checkbox" [(ngModel)]="partitionDocumentsSetting">Enable partitioning
                            documents</label>
                    </div>
                    <label title="Enter how many paragraphs are shown at a time">Piece size: <input class="form-control"
                                                                                                    [(ngModel)]="viewRangeSetting"
                                                                                                    type="number"
                                                                                                    min="1"></label>
                </div>
                <br>
                <tim-alert *ngIf="errorMessage" severity="warning">{{errorMessage}}</tim-alert>
                <tim-alert severity="info">The page may reload when the changes are saved.</tim-alert>
            </ng-container>
            <ng-container footer>
                <button title="Return default settings" class="timButton pull-left"
                        (click)="resetDefaults()">Reset defaults
                </button>
                <button class="timButton" title="Quit and save changes" (click)="ok()">OK</button>
                <button class="timButton" title="Quit and discard changes" (click)="dismiss()">Cancel</button>
            </ng-container>
        </tim-dialog-frame>
    `,
})
export class ViewRangeEditDialogComponent extends AngularDialogComponent<
    IItem,
    void
> {
    protected dialogName = "viewRangeEdit";
    private item!: IItem;
    partitionDocumentsSetting: boolean = false;
    viewRangeSetting: number = 20;
    errorMessage?: string;
    private storage: ngStorage.StorageService & {
        pieceSize: null | number;
    };

    constructor() {
        super();
        this.storage = $localStorage.$default({
            pieceSize: null,
        });
    }

    ngOnInit() {
        this.item = this.data;
        this.loadValues();
        (async () => {
            const cookie = await getPieceSize();
            if (cookie) {
                this.partitionDocumentsSetting = true;
            }
        })();
    }

    /**
     * Fetches options from local storage, if existent.
     */
    public loadValues() {
        if (this.storage.pieceSize != null) {
            this.viewRangeSetting = +this.storage.pieceSize;
        }
    }

    /**
     * Save new values to local storage.
     */
    private saveValues() {
        this.storage.pieceSize = this.viewRangeSetting;
    }

    /*
     * Dialog title.
     */
    public getTitle() {
        return "Edit view range";
    }

    /**
     * Saves view range settings and quits.
     */
    async ok() {
        this.errorMessage = undefined;
        if (!this.viewRangeSetting || this.viewRangeSetting < 1) {
            this.errorMessage =
                "Piece size needs to be an integer greater than zero.";
            return;
        }
        this.saveValues();
        if (this.partitionDocumentsSetting) {
            await setPieceSize(this.viewRangeSetting);
            const params = getCurrentPartitionURLParams();
            const b = params ? params.get("b") : undefined;
            let beginIndex = 0;
            if (b) {
                beginIndex = +b;
            }
            const range = await getViewRange(this.data.id, beginIndex, true);
            if (range) {
                partitionDocument(range, true);
            }
        } else {
            await unpartitionDocument();
        }
        this.close();
    }

    /**
     * Resets view range settings to defaults.
     */
    resetDefaults() {
        this.viewRangeSetting = 20;
        this.partitionDocumentsSetting = false;
    }
}

@NgModule({
    declarations: [ViewRangeEditDialogComponent],
    imports: [BrowserModule, DialogModule, FormsModule, TimUtilityModule],
})
export class ViewRangeEditDialogModule {}
