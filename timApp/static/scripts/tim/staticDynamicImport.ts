export function staticDynamicImport(s: string) {
    switch (s) {
        case "angular-ui-grid":
            return import("angular-ui-grid");
        case "/jsrunner/javascripts/build/jsrunner.js":
            return import("modules/jsrunner/client/javascripts/jsrunner");
        case "/field/js/build/numericfield.js":
            return import("modules/fields/js/numericfield");
        case "/field/js/build/textfield.js":
            return import("modules/fields/js/textfield");
        case "/pali/js/build/pali.js":
            return import("modules/pali/client/pali");
        case "tableForm":
            return import("tim/plugin/tableForm");
        case "tim/plugin/imagex":
            return import("tim/plugin/imagex");
        case "tim/document/slide":
            return import("tim/document/slide");
        case "qst":
            return import("tim/plugin/qstController");
        case "tape":
            return import("tim/plugin/tape");
        case "importData":
            return import("tim/plugin/import-data.component");
        case "timTable":
            return import("tim/plugin/timTable");
        case "timMenu":
            return import("tim/plugin/timMenuController");
        case "/cs/js/build/module.js":
            return import("modules/cs/js/module");
        case "/cs/js/build/stack.js":
            return import("modules/cs/js/stack");
        case "/cs/js/build/geogebra.js":
            return import("modules/cs/js/geogebra");
        case "/cs/js/build/jsav.js":
            return import("modules/cs/js/jsav");
        case "/cs/js/build/jsframe.js":
            return import("modules/cs/js/jsframe");
        case "/field/js/build/multisave.js":
            return import("modules/fields/js/multisave");
        case "/svn/js/video.js":
            return import("modules/svn/js/video");
        case "/field/js/build/rbfield.js":
            return import("modules/fields/js/rbfield");
        case "/field/js/build/cbfield.js":
            return import("modules/fields/js/cbfield");
        case "/field/js/build/dropdown.js":
            return import("modules/fields/js/dropdown");
        case "/drag/js/build/drag.js":
            return import("modules/drag/client/drag");
        case "/feedback/js/build/feedback.js":
            return import("modules/feedback/js/feedback");
        case "/field/js/build/goaltable.js":
            return import("modules/fields/js/goaltable");
        // Redirect mmcq scripts.
        case "/mmcq/script2.js":
        case "/mmcq/SimpleDirective.js":
        case "/mcq/script2.js":
        case "/mcq/SimpleDirective.js":
            return import("tim/plugin/mmcq");
    }
    throw Error(`Module was not statically known: ${s}`);
}
