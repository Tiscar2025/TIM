import {
        DoBootstrap,
        NgModule,
        StaticProvider,
        ApplicationRef,
    } from "@angular/core";
import {HttpClientModule} from "@angular/common/http";
import {FormsModule} from "@angular/forms";
import {BrowserModule} from "@angular/platform-browser";
import {platformBrowserDynamic} from "@angular/platform-browser-dynamic";
import {TimUtilityModule} from "tim/ui/tim-utility.module";
import {createDowngradedModule, doDowngrade} from "tim/downgrade";
import {CsRunnerComponent, CsTextComponent, CsConsoleComponent} from "./csPlugin";
import {ExtcheckComponent, OutputContainerComponent, CustomOutputDirective} from "./extcheck";
import {GitRegComponent} from "./gitreg";
import {CsUtilityModule} from "./util/module";
import {EditorModule} from "./editor/module";

@NgModule({
    declarations: [
        CsRunnerComponent,
        CsTextComponent,
        CsConsoleComponent,
        ExtcheckComponent,
        OutputContainerComponent,
        CustomOutputDirective,
        GitRegComponent,
    ],
    exports: [
        CsRunnerComponent,
        CsTextComponent,
        CsConsoleComponent,
        ExtcheckComponent,
        GitRegComponent,
    ],
    imports: [
        EditorModule,
        BrowserModule,
        HttpClientModule,
        FormsModule,
        TimUtilityModule,
        CsUtilityModule,
    ],
})
export class CsPluginModule implements DoBootstrap {
    ngDoBootstrap(appRef: ApplicationRef) {
    }
}

const bootstrapFn = (extraProviders: StaticProvider[]) => {
    const platformRef = platformBrowserDynamic(extraProviders);
    return platformRef.bootstrapModule(CsPluginModule);
};

export const angularJsModule = createDowngradedModule(bootstrapFn);
doDowngrade(angularJsModule, "csRunner", CsRunnerComponent);
doDowngrade(angularJsModule, "csTextRunner", CsTextComponent);
doDowngrade(angularJsModule, "csConsole", CsConsoleComponent);
doDowngrade(angularJsModule, "csExtcheckRunner", ExtcheckComponent);
doDowngrade(angularJsModule, "csGitRegRunner", GitRegComponent);
export const moduleDefs = [angularJsModule];
