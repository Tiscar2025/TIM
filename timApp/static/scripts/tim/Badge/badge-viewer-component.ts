import type {OnInit} from "@angular/core";
import {Component, NgModule} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {Users} from "tim/user/userService";
import {HttpClient, HttpClientModule} from "@angular/common/http";
import {toPromise} from "tim/util/utils";
import {BadgeModule} from "tim/Badge/Badge-component";
import {
    BadgeTestComponent,
    BadgeTestModule,
} from "tim/Badge/badge-test-component";

interface IBadge {
    id: number;
    title: string;
    color: string;
    image: number;
    shape: string;
    description: string;
}

@Component({
    selector: "tim-badge-viewer",
    template: `
        <ng-container *ngIf="badgeIDs.length == 0">
            <p>{{userName}}'s badges: </p>
            <tim-badge-test></tim-badge-test>
        </ng-container>
        <ng-container *ngIf="badgeIDs.length > 0">
            <p>{{userName}}'s badges: </p>
            <div class="main-wrapper">
                <div *ngFor="let badge of badges" class="badge yellow">
                    <div class="circle"> <i class="fa fa-shield"></i></div>
                    <div class="ribbon">{{badge.title}}</div>
                </div>
            </div>
        </ng-container>
        `,
    styleUrls: ["badge-viewer-component.scss"],
})
export class BadgeViewerComponent implements OnInit {
    userName?: string;
    userID: number;
    badges: IBadge[] = [];
    badgeIDs: number[] = [];

    constructor(private http: HttpClient) {
        this.userID = 0;
    }

    private async getBadges(id: number) {
        const response = toPromise(this.http.get<[]>("/groups_badges/" + id));

        const result = await response;

        if (result.ok) {
            if (result.result != undefined) {
                for (const alkio of result.result) {
                    const json = JSON.stringify(alkio);
                    const obj = JSON.parse(json);
                    this.badges.push(obj);
                    this.badgeIDs.push(obj.id);
                }
            }
        }
    }

    ngOnInit() {
        if (Users.isLoggedIn()) {
            this.userName = Users.getCurrent().name;
            this.userID = Users.getCurrent().id;
        }
        this.getBadges(this.userID);
        const component = new BadgeTestComponent();
        component.getBadge(this.badgeIDs);
    }
}

@NgModule({
    declarations: [BadgeViewerComponent],
    imports: [
        CommonModule,
        FormsModule,
        HttpClientModule,
        BadgeModule,
        BadgeTestModule,
    ],
    exports: [BadgeViewerComponent],
})
export class BadgeViewerModule {}
