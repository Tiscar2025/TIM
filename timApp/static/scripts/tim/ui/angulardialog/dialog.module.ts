import {NgModule} from "@angular/core";
import {DialogContainerComponent} from "tim/ui/angulardialog/dialog-container.component";
import {DialogHostDirective} from "tim/ui/angulardialog/dialog-host.directive";
import {DialogFrame} from "tim/ui/angulardialog/dialog-frame.component";
import {TimUtilityModule} from "tim/ui/tim-utility.module";
import {AngularDraggableModule} from "angular2-draggable";
import {BrowserModule} from "@angular/platform-browser";

@NgModule({
    declarations: [DialogContainerComponent, DialogHostDirective, DialogFrame],
    imports: [TimUtilityModule, BrowserModule, AngularDraggableModule],
    exports: [DialogFrame, DialogContainerComponent],
})
export class DialogModule {}
