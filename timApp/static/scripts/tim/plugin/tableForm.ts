/**
 * Defines the client-side implementation of a plugin for editing other plugins' answers in a formatted table
 */
import angular from "angular";
import * as t from "io-ts";
import {
    PluginBase,
    pluginBindings,
    } from "tim/plugin/util";
import {$http, $httpParamSerializer} from "tim/util/ngimport";
import {to} from "tim/util/utils";
import {timApp} from "../app";
import {getParId} from "../document/parhelpers";
import {ViewCtrl} from "../document/viewctrl";
import {IDocument} from "../item/IItem";
import {showInputDialog} from "../ui/inputDialog";
import {GenericPluginMarkup, GenericPluginTopLevelFields, nullable, withDefault} from "./attributes";
import "./tableForm.css";
import {CellType, colnumToLetters, DataEntity, isPrimitiveCell, TimTable} from "./timTable";

const tableFormApp = angular.module("tableFormApp", ["ngSanitize"]);
export const moduleDefs = [tableFormApp];

const TableFormMarkup = t.intersection([
    t.partial({
        anonNames: nullable(t.boolean),
        autosave: t.boolean,
        hideButtonText: nullable(t.string),
        openButtonText: withDefault(t.string, "Avaa Taulukko/Raporttinäkymä"),

        hiddenColumns: t.array(t.number),
        hiddenRows: t.array(t.number),
        maxWidth: t.string,
        minWidth: t.string,
        maxRows: t.string,
        open: t.boolean,
        filterRow: t.boolean,
        cbColumn: t.boolean,
        groups: t.array(t.string),
        usernames: withDefault(t.boolean, true),
        realnames: withDefault(t.boolean, true),
        emails: withDefault(t.boolean, false),
        report: nullable(t.boolean),
        reportButton: nullable(t.string),
        separator: nullable(t.string),
        singleLine: t.boolean,
        sortBy: nullable(t.string), /* TODO! Username and task, or task and username -- what about points? */
        table: nullable(t.boolean),
        removeDocIds: withDefault(t.boolean, true),
        removeUsersButtonText: nullable(t.string),
        userListButtonText: nullable(t.string),
        emailUsersButtonText: nullable(t.string),
    }),
    GenericPluginMarkup,
    t.type({
        // all withDefaults should come here; NOT in t.partial
        autoupdate: withDefault(t.number, 500),
        cols: withDefault(t.number, 20),
    }),
]);

const Rows = t.dictionary(t.string, t.dictionary(t.string, t.union([t.string, t.null, t.number])));
interface IRowsType extends t.TypeOf<typeof Rows> {
}

const realname = t.dictionary(t.string, t.string);
const TableFormAll = t.intersection([
    t.partial({
        aliases: t.dictionary(t.string, t.string),
        fields: t.array(t.string),
        realnamemap: t.dictionary(t.string, t.string),
        rows: Rows,
    }),
    GenericPluginTopLevelFields,
    t.type({markup: TableFormMarkup}),
]);

class TableFormController extends PluginBase<t.TypeOf<typeof TableFormMarkup>, t.TypeOf<typeof TableFormAll>, typeof TableFormAll> {
    public viewctrl?: ViewCtrl;
    private result?: string;
    private error?: string;
    private isRunning = false;
    private userfilter = "";
    private data: TimTable & {userdata: DataEntity} = {
        hid: {edit: false, insertMenu: true, editMenu: true},
        hiddenRows: [],
        hiddenColumns: [],
        hideSaveButton: true,
        // lockCellCount: true,
        lockedCells: [],
        table: {countRow: 0, countCol: 0, columns: []},
        // TODO: give rows (and maybe colums) in data.table
        task: true,
        userdata: {type: "Relative", cells: {}},
        // saveCallBack: this.singleCellSave
    };
    // TODO: Change row format to properly typed format (maybe userobject:IRowstype) format
    private rows!: IRowsType;
    private oldCellValues!: string;
    private realnames = false;
    private usernames = false;
    private emails = false;
    private showTable = true;
    private userNameColumn = "A";
    private realNameColumn = "B";
    private headerRow = 1;
    private rowKeys!: string[];
    private userlist: string = "";
    private listSep: string = "-";
    private listEmail: boolean = false;

    getDefaultMarkup() {
        return {};
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Used to define table view & relative save button in angular, true or false.
     */
     buttonText() {
        return (this.attrs.buttonText || "Tallenna taulukko");
    }

     hideButtonText() {
        return (this.attrs.hideButtonText);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Used to define table view & relative save button in angular, true or false.
     */
     reportButton() {
        return (this.attrs.reportButton || "Luo Raportti");
    }

    async $onInit() {
        super.$onInit();
        this.userfilter = "";
        // this.realnames = true;
        if (this.attrs.realnames) {
            this.realnames = true;
            const temp = this.realNameColumn;
            this.realNameColumn = this.userNameColumn;
            this.userNameColumn = temp;
        }
        this.rows = this.attrsall.rows || {};
        this.rowKeys = Object.keys(this.rows);
        this.setDataMatrix();
        this.oldCellValues = JSON.stringify(this.data.userdata.cells);
        if (this.attrs.autosave) { this.data.saveCallBack = (rowi, coli, content) => this.singleCellSave(rowi, coli, content); }
        if (this.attrs.minWidth) { this.data.minWidth = this.attrs.minWidth; }
        if (this.attrs.maxWidth !== undefined) { this.data.maxWidth = this.attrs.maxWidth; }
        if (this.attrs.singleLine) {
            this.data.singleLine = this.attrs.singleLine;
        }
        if (this.attrs.open != undefined) { this.showTable = this.attrs.open; }
        this.data.hiddenColumns = this.attrs.hiddenColumns;
        this.data.hiddenRows = this.attrs.hiddenRows;
        this.data.cbColumn = this.attrs.cbColumn;
        this.data.filterRow = this.attrs.filterRow;
        this.data.maxRows = this.attrs.maxRows;
    }

    /**
     * Returns the TimTableController within the tableForm
     */
    getTimTable() {
        const parId = getParId(this.getPar());
        if (this.viewctrl && parId) {
            return this.viewctrl.getTableControllerFromParId(parId);
        }
    }

    /**
     * Sorts row key values (usernames) by their real name attribute in this.realnamemap
     * @param a username to conmpare with b
     * @param b username to compare with a
     */
    sortByRealName(a: string, b: string) {
        if (!this.attrsall.realnamemap) { return 0; }
        try {
            return this.attrsall.realnamemap[a].localeCompare(this.attrsall.realnamemap[b]);
        } catch (e) {
            return 0;
        }
    }

    /**
     * Transforms user/task combination defined in this.rows into cell format and sets up the table
     * TODO: generate rows/columns for this.data.table, possibly needed for more easily maintained layout handling
     */
    setDataMatrix() {
        try {
            this.data.userdata.cells[this.userNameColumn + this.headerRow] = {
                cell: "Käyttäjänimi",
                backgroundColor: "#efecf1",
            };
            if (this.realnames) {
                this.data.userdata.cells[this.realNameColumn + this.headerRow] = {
                    cell: "Henkilön Nimi",
                    backgroundColor: "#efecf1",
                };
                this.rowKeys.sort((a, b) => this.sortByRealName(a, b));
            }
            if (this.attrsall.fields && this.realnames) {
                this.data.table.countCol = this.attrsall.fields.length + 2;
            } else if (this.attrsall.fields) {
                this.data.table.countCol = this.attrsall.fields.length + 1;
            }
            this.data.table.countRow = Object.keys(this.rows).length + 1;
            let y = 2;
            if (!this.data.lockedCells) { this.data.lockedCells = []; }
            for (const r of this.rowKeys) {
                this.data.userdata.cells[this.userNameColumn + y] = {cell: r, backgroundColor: "#efecf1"};
                this.data.lockedCells.push(this.userNameColumn + y);
                if (this.realnames && this.attrsall.realnamemap) {
                    this.data.userdata.cells[this.realNameColumn + y] = {
                        cell: this.attrsall.realnamemap[r],
                        backgroundColor: "#efecf1",
                    };
                    this.data.lockedCells.push(this.realNameColumn + y);
                }
                y++;
            }
            // TODO: Load default cell colors from tableForm's private answer?
            let xOffset = 1;
            if (this.realnames) {
                xOffset = 2;
            }
            if (this.attrsall.fields) {
                for (let x = 0; x < this.attrsall.fields.length; x++) {

                    const colheader = this.attrsall.fields[x];
                    /*  // Done in server side
                    if ( this.attrs.removeDocIds && colheader.match(/^\d+\..+/)) {
                        colheader = colheader.substring(colheader.indexOf(".") + 1);
                    }
                    */

                    this.data.userdata.cells[colnumToLetters(x + xOffset) + 1] = {
                        cell: colheader,
                        backgroundColor: "#efecf1",
                    };
                    this.data.lockedCells.push(colnumToLetters(x + xOffset) + 1);
                    // y = 0;
                    // for (const [u, r] of Object.entries(this.rows)) {
                    //     if (r[this.attrsall.fields[x]]) {
                    //         this.data.userdata.cells[colnumToLetters(x + xOffset) + (y + 2)] = r[this.attrsall.fields[x]];
                    //     }
                    //     y++;
                    // }
                    for (y = 0; y < this.rowKeys.length; y++) {
                        this.data.userdata.cells[colnumToLetters(x + xOffset) + (y + 2)] = this.rows[this.rowKeys[y]][this.attrsall.fields[x]];
                    }
                }
            }
        } catch (e) {
            console.log(e);
            this.error = "Error in setDataMatrix" + "\n" + e;
        }
    }

    /**
     * Clears the usernamefilter
     */
    initCode() {
        this.userfilter = "";
        this.error = undefined;
        this.result = undefined;
    }

    /**
     * Closes timTable's editor and saves the cell that is being currently edited
     */
    saveText() {
        const timTable = this.getTimTable();
        if (timTable == null) {
            return;
        }
        timTable.saveAndCloseSmallEditor();
        this.doSaveText([]);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Returns true value, if table attribute is true.
     * Used to define table view & relative save button in angular, true or false.
     */
    tableCheck() {
        // return (this.attrs.table === true);
        if (this.attrs.table != undefined) { return this.attrs.table; } else { return true; }
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Returns true value, if report attribute is true.
     * Used to define create report button in angular, true or false.
     */
    reportCheck() {
        return (this.attrs.report == true);
    }

    /**
     * Boolean to determinate if usernames are viewed in report.
     * Choises are true for username and false for anonymous. Username/true as default.
     */
    anonNames() {
        if (this.attrs.anonNames) {
            return this.attrs.anonNames;
        } else { return false; }
    }

    /**
     * String to determinate how usernames are filtered in report.
     * Choises are username, username and full name and anonymous. Username as default.
     */
    sortBy() {
        return (this.attrs.sortBy || "username");
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Generates report based on the table.
     * Used if report is set to true and create report button is clicked.
     * Used to define table view & relative save button in angular, true or false.
     */
    generateReport() {
        const dataTable = this.generateCSVTable();
        const win = window.open("/tableForm/generateCSV?" + $httpParamSerializer({data: JSON.stringify(dataTable), separator: (this.attrs.separator || ",")}), "WINDOWID");
        if (win == null) {
            this.error = "Failed to open report window.";
        }
    }

    generateCSVTable() {
        const timTable = this.getTimTable();
        if (timTable == null) {
            return;
        }
        const result: CellType[][] = [];
        const rowcount = Object.keys(this.rows).length + 1;
        let colcount = 0;
        if (this.attrsall.fields && this.attrsall.fields.length) {
            colcount = this.attrsall.fields.length + 1;
        }
        if (this.realnames) { colcount += 1; }
        for (let i = 0; i < rowcount; i++) {
            // TODO: In future: change hiddenRows check if hiddenRows is changed from number[] to IRows
            // TODO: Check for hiddenColumns
            if (this.data.hiddenRows && this.data.hiddenRows.includes(i)) { continue; }
            const row: CellType[] = [];
            result.push(row);
            for (let j = 0; j < colcount; j++) {
                if (this.anonNames() && j == 0 && i > 0) {
                    row.push("Anonymous" + [i]);
                    continue;
                }
                if (this.anonNames() && this.realnames && j == 1 && i > 0) {
                    row.push("Unknown" + [i]);
                    continue;
                }
                row.push(timTable.cellDataMatrix[i][j].cell);
            }
        }
        return result;
    }

    /**
     * Make list of users colIndex.  Separate items by separators
     * @param users array of users
     * @param colIndex what index to use for list
     * @param perseparator what comes before evyry item
     * @param midseparator what comes between items
     */
    makeUserList(users: string[][], colIndex: number, preseparator: string, midseparator: string): string {
        let result = "";
        let sep = "";
        for (const r of users) {
            result += sep + preseparator + r[colIndex];
            sep = midseparator;
        }
        return result;
    }

    /**
     * Removes selected users from the group
     */
    async removeUsers() {
        const timTable = this.getTimTable();
        if (timTable == null) {
            return;
        }
        const selUsers = timTable.getCheckedRows(1, true);
        let msg = "";
        for (const r of selUsers) {
            msg += r.join(", ") + "<br>";
        }
        if ( msg == "" ) { return; }

        if ( !this.attrs.groups ) { return; }
        const group = this.attrs.groups[0];

        const doc = await showInputDialog({
            defaultValue: "",
            text: "<b>Really remove following users from group:</b> " + group + "<br>\n<pre>\n" + msg + "\n</pre>",
            title: "Remove user from group " + group,
            isInput: false,
            validator: async (s) => {
                const ulist = this.makeUserList(selUsers, 1, "", ",");
                // /groups/removemember/group/ ulist
                const r = await to($http.get<IDocument>(`/groups/removemember/${group}/${ulist}`));
                if (r.ok) {
                    return {ok: true, result: r.result.data};
                } else {
                    return {ok: false, result: r.result.data.error};
                }
            },
        });
        location.reload();
    }

    listUsernames() {
        const timTable = this.getTimTable();
        if (timTable == null) {
            return;
        }
        let preseparator = " - ";
        let midseparator = "\n";
        let sep = this.listSep;
        let colindex = 1;
        const selUsers = timTable.getCheckedRows(1, true);
        if ( this.listEmail ) { midseparator = "\n"; preseparator = ""; colindex = 2; }
        if ( sep == "" ) { sep = "\n"; }
        if ( sep != "-") { midseparator = sep; preseparator = ""; }
        this.userlist = this.makeUserList(selUsers, colindex, preseparator, midseparator);
    }

    copyList() {
        const ta = this.element.find("#userlist");
        ta.focus(); ta.select(); document.execCommand("copy");
    }

    singleCellSave(rowi: number, coli: number, content: string) {
        const cells = [this.userNameColumn + (rowi + 1), colnumToLetters(coli) + this.headerRow, colnumToLetters(coli) + (rowi + 1)];
        this.doSaveText(cells);
    }

    openTable() {
        this.showTable = true;
    }

    closeTable() {
        this.showTable = false;
    }

    /**
     * Transforms the cell format back to row format and saves the table input
     * @param cells
     */
    async doSaveText(cells: string[]) {
        this.error = "... saving ...";
        let keys;
        if (cells && cells.length > 0) {
            keys = cells;
        } else {
            keys = Object.keys(this.data.userdata.cells);
        }
        // Sort because for now column containing usernames and row containing headers has to be checked first
        // in order to track which column has which task etc
        keys.sort();
        // TODO: Optimise save? (keep track of userLocations and taskLocations at SetDataMatrix) - or iterate through
        //  headerRow / userNameColum first
        // if these are tracked would need to obtain updated location info from timtable if it implements sort
        const userLocations: {[index: string]: string} = {};
        const taskLocations: {[index: string]: string} = {};
        const replyRows: {[index: string]: {[index: string]: CellType}} = {};
        for (const coord of keys) {
            const alphaRegExp = new RegExp("([A-Z]*)");
            const alpha = alphaRegExp.exec(coord);
            if (alpha == null) {
                continue;
            }
            const columnPlace = alpha[0];
            const numberPlace = coord.substring(columnPlace.length);
            const cell = this.data.userdata.cells[coord];
            let cellContent;
            // TODO: Save cell attributes (e.g backgroundColor) as plugin's own answer to let users take advantage
            //  of timTable's cell layout editing
            if (!isPrimitiveCell(cell)) {
                cellContent = cell.cell;
            } else {
                cellContent = cell;
            }
            if (cellContent === null) {
                cellContent = "";
            } else if (typeof cellContent === "boolean" || typeof cellContent === "number") {
                cellContent = cellContent.toString();
            }
            // else if (typeof cellContent === "boolean") {
            //     throw new Error("cell was boolean?");

            if (columnPlace === this.userNameColumn) {
                if (numberPlace === this.headerRow.toString()) { continue; }
                userLocations[numberPlace] = cellContent;
                replyRows[cellContent] = {};
            } else if (this.realnames && columnPlace === this.realNameColumn) {
                continue;
            } else if (numberPlace === this.headerRow.toString()) {
                let contentalias;
                if (this.attrsall.aliases && cellContent in this.attrsall.aliases) {
                    contentalias = this.attrsall.aliases[cellContent];
                } else { contentalias = cellContent; }
                taskLocations[columnPlace] = contentalias;
            } else {
                replyRows[userLocations[numberPlace]][taskLocations[columnPlace]] = cellContent;
            }
        }
        const params = {
            input: {
                nosave: false,
                replyRows: replyRows,
            },
        };
        const url = this.pluginMeta.getAnswerUrl();
        const r = await to($http.put<{ web: { result: string, error?: string } }>(url, params));
        this.isRunning = false;
        if (r.ok) {
            const data = r.result.data;
            this.error = data.web.error;
            // this.result = "Saved";
        } else {
            this.error = r.result.data.error; // "Infinite loop or some other error?";
        }
    }

    protected getAttributeType() {
        return TableFormAll;
    }
}

timApp.component("tableformRunner", {
    bindings: pluginBindings,

    controller: TableFormController,
    require: {
        viewctrl: "?^timView",
    },
    template: `
<div class="tableform" ng-if="$ctrl.showTable">
    <tim-markup-error ng-if="::$ctrl.markupError" data="::$ctrl.markupError"></tim-markup-error>
    <h4 ng-if="::$ctrl.header" ng-bind-html="::$ctrl.header"></h4>
    <p ng-if="::$ctrl.stem" ng-bind-html="::$ctrl.stem"></p>
    <tim-table disabled="!$ctrl.tableCheck()" data="::$ctrl.data" taskid="{{$ctrl.pluginMeta.getTaskId()}}" plugintype="{{$ctrl.pluginMeta.getPlugin()}}"></tim-table>
</div>
    <div class="hidden-print">
    <button class="timButton"
            ng-if="::$ctrl.tableCheck() && !$ctrl.attrs.autosave"
            ng-click="$ctrl.saveText()">
            {{ ::$ctrl.buttonText() }}
    </button>
    <button class="timButton"
            ng-if="::$ctrl.reportCheck()"
            ng-click="$ctrl.generateReport()">
            {{ ::$ctrl.reportButton() }}
    </button>
    <button class="timButton"
            ng-click="$ctrl.closeTable()"
            ng-if="::$ctrl.hideButtonText()">
            {{::$ctrl.hideButtonText()}}
    </button>
    <button class="timButton"
            ng-click="$ctrl.removeUsers()"
            ng-if="::$ctrl.attrs.removeUsersButtonText">
            {{::$ctrl.attrs.removeUsersButtonText}}
    </button>
    <button class="timButton"
            ng-click="$ctrl.listUsernames()"
            ng-if="::$ctrl.attrs.userListButtonText">
            {{::$ctrl.attrs.userListButtonText}}
    </button>
    <button class="timButton"
            ng-click="$ctrl.emailUsern()"
            ng-if="::$ctrl.attrs.emailUsersButtonText">
            {{::$ctrl.attrs.emailUsersButtonText}}
    </button>
    </div>
    <div class="csRunDiv " style="padding: 1em;" ng-if="$ctrl.userlist"> <!-- userlist -->
        <p class="closeButton" ng-click="$ctrl.userlist=''"></p>
        <p>Separator:
        <input type="radio" name="listsep" ng-model="$ctrl.listSep" value = "-" ng-change="$ctrl.listUsernames()">-
        <input type="radio" name="listsep" ng-model="$ctrl.listSep" value = "," ng-change="$ctrl.listUsernames()">,
        <input type="radio" name="listsep" ng-model="$ctrl.listSep" value = "|" ng-change="$ctrl.listUsernames()">|
        <input type="radio" name="listsep" ng-model="$ctrl.listSep" value = ";" ng-change="$ctrl.listUsernames()">;
        <input type="radio" name="listsep" ng-model="$ctrl.listSep" value = "\n" ng-change="$ctrl.listUsernames()">\\n
        </p>
        <input type="checkbox" ng-model="$ctrl.listEmail" ng-change="$ctrl.listUsernames()">Email<br>
        <textarea id="userlist" ng-model="$ctrl.userlist" rows="10" cols="40"></textarea>
        <button class="timButton"
                ng-click="$ctrl.copyList()">
                Copy
        </button>
    </div>
    <pre ng-if="$ctrl.result">{{$ctrl.result}}</pre>
    <pre ng-if="$ctrl.error" ng-bind-html="$ctrl.error"></pre>
    <p ng-if="::$ctrl.footer" ng-bind="::$ctrl.footer" class="plgfooter"></p>
</div>
<div class="tableOpener" ng-if="!$ctrl.showTable">
    <button class="timButton"
            ng-click="$ctrl.openTable()">
            {{::$ctrl.attrs.openButtonText}}
    </button>
</div>
<br>
`,
});
