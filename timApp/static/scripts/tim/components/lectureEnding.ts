import {DialogController, registerDialogComponent, showDialog} from "../dialog";
import {hasLectureEnded, ILecture} from "../lecturetypes";

export interface ILectureEndingDialogResult {
    extendTime: number;
    result: "extend" | "dontextend" | "end";
}

class LectureEndingCtrl extends DialogController<{lecture: ILecture}, ILectureEndingDialogResult> {
    private extendTimes = [5, 10, 15, 30, 45, 60];
    private selectedTime = 15;

    public noExtend() {
        this.close({result: "dontextend", extendTime: this.selectedTime});
    }

    public extend() {
        this.close({result: "extend", extendTime: this.selectedTime});
    }

    public end() {
        this.close({result: "end", extendTime: this.selectedTime});
    }

    public hasLectureEnded() {
        return hasLectureEnded(this.resolve.lecture);
    }
}

registerDialogComponent("timLectureEnding",
    LectureEndingCtrl,
    {
        template: `<div>
    <h1>Lecture ends in
    <timer interval="1000"
           max-time-unit="'day'"
           end-time="$ctrl.resolve.lecture.end_time">
           {{ days > 0 ? days + ' day' + daysS + ' +' : '' }} {{ hhours }}:{{ mminutes }}:{{ sseconds }}
           </timer></h1>

    <form class="extendLectureOptions">
        <label> Extend by
            <select ng-model="$ctrl.selectedTime" ng-options="choice for choice in $ctrl.extendTimes">
            </select>
            minutes
        </label>
    </form>
    <div class="buttons">
        <button class="timButton" autofocus ng-click="$ctrl.extend()">Extend</button>
        <button class="timButton" ng-show="!$ctrl.hasLectureEnded()" ng-click="$ctrl.end()">End</button>
        <button
                class="timButton"
                ng-show="$ctrl.hasLectureEnded()"
                ng-click="$ctrl.noExtend()">Don't extend
        </button>
    </div>
</div>
`,
    });

export async function showLectureEnding(lecture: ILecture) {
    return await showDialog<LectureEndingCtrl,
        {lecture: ILecture},
        ILectureEndingDialogResult>("timLectureEnding", {lecture: () => lecture});
}
