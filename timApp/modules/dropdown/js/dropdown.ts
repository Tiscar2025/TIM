/**
 * Defines the client-side implementation of a dropdown plugin.
 */
import angular, {INgModelOptions} from "angular";
import * as t from "io-ts";
import {ITimComponent, ViewCtrl} from "tim/document/viewctrl";
import {GenericPluginMarkup, nullable, PluginBase, withDefault} from "tim/plugin/util";

const dropdownApp = angular.module("dropdownApp", ["ngSanitize"]);
export const moduleDefs = [dropdownApp];

const DropdownMarkup = t.intersection([
    t.partial({
        initword: t.string,
        inputplaceholder: nullable(t.string),
        inputstem: t.string,
        words: t.array(t.string),
        followid: t.string,
    }),
    GenericPluginMarkup,
    t.type({
        // all withDefaults should come here; NOT in t.partial
        autoupdate: withDefault(t.number, 500),
        cols: withDefault(t.number, 20),
    }),
]);
const DropdownAll = t.intersection([
    t.partial({
        userword: t.string,
    }),
    t.type({markup: DropdownMarkup}),
]);

class DropdownController extends PluginBase<t.TypeOf<typeof DropdownMarkup>, t.TypeOf<typeof DropdownAll>, typeof DropdownAll> implements ITimComponent {
    private error?: string;
    private wordlist?: string[];
    private selectedWord?: string;
    private vctrl!: ViewCtrl;

    getDefaultMarkup() {
        return {};
    }

    $onInit() {
        super.$onInit();
        this.wordlist = this.attrs.words || [];
        this.addToCtrl();
    }

    /**
     * Adds this plugin to ViewCtrl so other plugins can get information about the plugin though it.
     */
    addToCtrl() {
        const taskid = this.pluginMeta.getTaskId() || ""; // TODO: fix this dirty stuff
        const name = taskid.split(".");
        this.vctrl.addTimComponent(this, this.attrs.followid || name[1] || "");
    }

    initCode() {
        this.error = undefined;
        this.selectedWord = undefined;
        //this.wordlist = this.attrs.words || [];
    }

    /**
     * Returns the selected choice from the dropdown-list.
     * @returns {string} The selected choice..
     */
    getContent(): string {
        return this.selectedWord || "Nothing selected";
    }

    /**
     * Does nothing at the moment
     */
    save(): string {
      return "";
    }

    protected getAttributeType() {
        return DropdownAll;
    }
}

dropdownApp.component("dropdownRunner", {
    bindings: {
        json: "@",
    },
    controller: DropdownController,
    require: {
        vctrl: "^timView",
    },
    template: `
<div>
    <h4 ng-if="::$ctrl.header" ng-bind-html="::$ctrl.header"></h4>
    <p ng-if="::$ctrl.stem">{{::$ctrl.stem}}</p>
    <div class="form-inline"><label>{{::$ctrl.inputstem}} <span>
        <select ng-model="$ctrl.selectedWord" ng-options="item for item in $ctrl.wordlist">
        </select>
        </span></label>
    </div>
    <div ng-if="$ctrl.error" ng-bind-html="$ctrl.error"></div>
    <p ng-if="::$ctrl.footer" ng-bind="::$ctrl.footer" class="plgfooter"></p>
</div>
`,
});
