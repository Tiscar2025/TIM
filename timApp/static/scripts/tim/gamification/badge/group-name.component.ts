import {
    Component,
    Inject,
    Input,
    NgModule,
    OnInit,
    SimpleChanges,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormControl, ReactiveFormsModule, Validators} from "@angular/forms";
import {HttpClient} from "@angular/common/http";
import {UserService} from "tim/user/userService";
import {UserGroupDialogComponent} from "tim/user/user-group-dialog.component";
import {BadgeService} from "./badge.service";
import {cons} from "fp-ts/ReadonlyNonEmptyArray";
import {manageglobals} from "tim/util/globals";
import {IFolder, IFullDocument} from "tim/item/IItem";

@Component({
    selector: "tim-group-name",
    template: `
        <ng-container>
            <div class="current">
                <p>Current group name: <b>{{ showFullName ? groupName : subGroup || 'No group name available' }}</b></p>
            </div>
            <div class="changeName">
                <button (click)="toggleFullName()">Toggle parent group</button>
                <button (click)="toggleInput()">Change group name</button>
            </div>
            <div *ngIf="showInput">
                <input [formControl]="newName" placeholder="Enter new group name"/>
                <button (click)="saveName()" [disabled]="newName.invalid">Save</button>
                <button (click)="toggleInput()">Cancel</button>
            </div>
        </ng-container>
    `,
    styleUrls: ["./group-name.component.scss"],
})
export class GroupNameComponent implements OnInit {
    @Input() group!: string;
    @Input() username!: string;
    groupName: string | null = null;
    parentGroup: string | undefined;
    subGroup: string | undefined;
    group_id: number | undefined;
    item: IFullDocument | IFolder | undefined;
    newName = new FormControl("", [Validators.required]);
    displayedName: string | null | undefined;
    showInput: boolean = false;
    showFullName = false;

    constructor(private badgeService: BadgeService) {}

    parseParentGroup() {
        if (!this.groupName) return;
        const nameParts = this.groupName.split("-");
        this.parentGroup = nameParts[0];
        this.subGroup = nameParts.slice(1).join(".");
        this.displayedName = this.subGroup;
    }

    toggleInput() {
        this.showInput = !this.showInput;
    }

    toggleFullName() {
        this.showFullName = !this.showFullName;
        this.displayedName = this.showFullName ? this.groupName : this.subGroup;
    }

    async saveName() {
        if (this.newName.valid) {
            this.groupName = this.newName.value;
            this.showInput = false;
        }

        if (this.item) {
            if (this.groupName != null) {
                this.item.name = this.groupName;
            }
            await this.badgeService.updateGroupName(
                this.item.id,
                this.item.name
            );
        }
        window.location.reload();
        return "Name successfully changed to: " + this.groupName;
    }

    ngOnInit(): void {
        this.item = manageglobals().curr_item;
        this.group = this.item.title; // this.item.name on sivun "short title" sivun asetuksissa
        console.log("Group name: ", this.item.title, "\nid: ", this.item.id);

        this.groupName = this.group;
        console.log("Oikeesti se nimi on ", this.groupName);
        this.parseParentGroup(); // Ensure subGroup and parentGroup are set

        console.log("Parsed Group Name: ", this.groupName);
        console.log("SubGroup: ", this.subGroup);
    }
}

@NgModule({
    declarations: [GroupNameComponent],
    exports: [GroupNameComponent],
    imports: [CommonModule, ReactiveFormsModule],
})
export class GroupNameModule {}
