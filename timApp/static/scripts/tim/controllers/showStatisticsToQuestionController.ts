import * as chart from "tim/directives/showChartDirective";
import {markAsUsed, to} from "tim/utils";
import {DialogController, registerDialogComponent, showDialog} from "../dialog";
import {IAskedQuestion, IQuestionAnswer} from "../lecturetypes";
import {$http, $timeout} from "../ngimport";

markAsUsed(chart);

export type IStatisticsParams = IAskedQuestion;

export interface IStatisticsResult {
}
export class ShowStatisticsToQuestionController extends DialogController<{params: IStatisticsParams}, IStatisticsResult, "timQuestionStatistics"> {
    private answers: IQuestionAnswer[] = [];
    private ended = false;

    constructor() {
        super();
    }

    public getTitle() {
        return `Question ${this.resolve.params.json.json.questionTitle} statistics`;
    }

    $onInit() {
        super.$onInit();
        void this.getLectureAnswers();
    }

    /**
     * Gets answers from the current lecture to current question.
     */
    private async getLectureAnswers() {
        while (!this.closed) {
            const [err, response] = await to($http.get<IQuestionAnswer[]>("/getLectureAnswers", {
                params: {
                    asked_id: this.resolve.params.asked_id,
                    buster: new Date().getTime(),
                },
            }));
            if (response) {
                const data = response.data;
                for (const ans of data) {
                    this.answers.push(ans);
                }
            } else {
                this.ended = true;
                return;
            }
            await $timeout(1000);
        }
    }
}

registerDialogComponent("timQuestionStatistics",
    ShowStatisticsToQuestionController,
    {
        template: `
<tim-dialog>
    <dialog-header ng-bind-html="$ctrl.getTitle()">

    </dialog-header>
    <dialog-body>
        <show-chart-directive
                divresize="true"
                question="$ctrl.resolve.params"
                answers="$ctrl.answers"></show-chart-directive>
        <p ng-show="$ctrl.ended">Question has ended.</p>
    </dialog-body>
    <dialog-footer>
        <button class="timButton" ng-click="$ctrl.close()">Close</button>
    </dialog-footer>
</tim-dialog>
`,
    });

export async function showStatisticsDialog(p: IStatisticsParams) {
    return await showDialog<ShowStatisticsToQuestionController>("timQuestionStatistics", {params: () => p}).result;
}
