/**
 * Defines the client-side implementation of an example plugin (a palindrome checker).
 */
import angular from "angular";
import * as t from "io-ts";
import {GenericPluginMarkup, GenericPluginTopLevelFields, nullable, PluginBase, pluginBindings} from "tim/plugin/util";
import {$http} from "tim/util/ngimport";
import {to} from "tim/util/utils";

const jsrunnerApp = angular.module("jsrunnerApp", ["ngSanitize"]);
export const moduleDefs = [jsrunnerApp];

const JsrunnerMarkup = t.intersection([
    t.partial({
        defaultCredits: t.number,
        defaultPoints: t.number,
        failGrade: t.string,
        fields: t.array(t.string),
        gradeField: t.string,
        gradingScale: t.dictionary(t.string, t.number),
        groups: t.array(t.string),
        program: nullable(t.string),
    }),
    GenericPluginMarkup,
    t.type({
        // all withDefaults should come here; NOT in t.partial
    }),
]);
const JsrunnerAll = t.intersection([
    GenericPluginTopLevelFields,
    t.type({markup: JsrunnerMarkup}),
]);

class JsrunnerController extends PluginBase<t.TypeOf<typeof JsrunnerMarkup>, t.TypeOf<typeof JsrunnerAll>, typeof JsrunnerAll> {
    private error?: string;
    private isRunning = false;

    getDefaultMarkup() {
        return {};
    }

    buttonText() {
        return super.buttonText() || "Count";
    }

    $onInit() {
        super.$onInit();
    }

    checkFields() {
        this.doCheckFields(false);
    }

    async doCheckFields(nosave: boolean) {
        this.error =  "... undefined or no rights to fields ..."; // TODO: errorviesti tulee aina
        this.isRunning = true;
        const params = {
            input: {
                nosave: false,
            },
        };

        if (nosave) {
            params.input.nosave = true;
        }
        const url = this.pluginMeta.getAnswerUrl();
        const r = await to($http.put<{web: {result: string, error?: string}}>(url, params));
        this.isRunning = false;
        if (r.ok) {
            const data = r.result.data;
            window.location.reload(); // TODO: ei toimi aina
            this.error = data.web.error;
        } else {
            r.result.data.error = "Infinite loop or some other error?"; // TODO: näinkö?
        }

    }

    protected getAttributeType() {
        return JsrunnerAll;
    }
}

jsrunnerApp.component("jsRunner", {
    bindings: pluginBindings,
    controller: JsrunnerController,
    require: {
        vctrl: "^timView",
    },
    template: `
<div class="csRunDiv no-popup-menu">
    <tim-markup-error ng-if="::$ctrl.markupError" data="::$ctrl.markupError"></tim-markup-error>
    <h4 ng-if="::$ctrl.header" ng-bind-html="::$ctrl.header"></h4>
    <p ng-if="::$ctrl.stem" ng-bind-html="::$ctrl.stem"></p>
    <button class="timButton"
            ng-if="::$ctrl.buttonText()"
            ng-disabled="$ctrl.isRunning || $ctrl.readonly"
            ng-click="$ctrl.checkFields()">
        {{::$ctrl.buttonText()}}
    </button>
    <a href="" ng-if="$ctrl.edited" ng-click="$ctrl.initCode()">{{::$ctrl.resetText}}</a>
    <div ng-if="$ctrl.error" ng-bind-html="$ctrl.error"></div>
    <pre ng-if="$ctrl.result">{{$ctrl.result}}</pre>
    <p ng-if="::$ctrl.footer" ng-bind="::$ctrl.footer" class="plgfooter"></p>
</div>
`,
});
