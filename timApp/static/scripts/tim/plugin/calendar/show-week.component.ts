import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CalendarView} from "angular-calendar";
import {getISOWeek} from "date-fns";

@Component({
    selector: "tim-show-week",
    template: `
        <ng-container>
        <h4> {{getWeekNumberFromDate(viewDate)}} </h4>
        </ng-container>`,
    styleUrls: ["calendar.component.scss"],
})
export class ShowWeekComponent {
    @Input() view: CalendarView = CalendarView.Week;

    @Input() viewDate: Date = new Date();

    @Input() locale: string = "fi-FI";

    @Output() viewChange = new EventEmitter<CalendarView>();

    @Output() viewDateChange = new EventEmitter<Date>();

    CalendarView = CalendarView;

    /**
     * Calculates the current week number according to given Date-object. Takes into account the possibility
     * of need for presentation of different locales.
     *
     * @param viewDate Current Date's object
     */
    getWeekNumberFromDate(viewDate: Date) {
        switch (this.locale) {
            case "en-US":
                return "Week: " + getISOWeek(viewDate);
            default:
                return "Viikko: " + getISOWeek(viewDate);
        }
    }
}
