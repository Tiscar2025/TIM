/**
 * Math Editor for inputting LaTeX math
 * @author Juha Reinikainen
 * @licence MIT
 * @date 20.2.2023
 */

import type {OnInit} from "@angular/core";
import {Component, ElementRef, Input, ViewChild} from "@angular/core";
import {FormControl} from "@angular/forms";
import type {
    IMathQuill,
    MathFieldMethods,
    MathQuillConfig,
} from "vendor/mathquill/mathquill";
import type {IEditor} from "./editor";
import {AceEditorComponent} from "./ace";

/**
 * Field which has the focus
 */
enum ActiveEditorType {
    Visual = "visual",
    Latex = "latex",
}

@Component({
    selector: "cs-math-editor",
    template: `
        <div class="math-editor-container">
            <div class="formula-editor">
                <div class="formula-container">
                    <span #visualInput></span>
        
                    <textarea name="math-editor-output" #latexInput cols="30" rows="10"
                              (click)="handleLatexFocus()"
                              (keyup)="handleLatexInput()"
                              [formControl]="latexInputControl">
                    </textarea>                    
                </div>

                <div class="formula-button-container">
                    <button (click)="handleFormulaOk()">Ok</button>
                    <button>Cancel</button>                    
                </div>                

            </div>

            
             <cs-ace-editor #aceEditor
                    [languageMode]="languageMode"
                    [minRows]="minRows"
                    [maxRows]="maxRows"
                    [placeholder]="placeholder"
                    [disabled]="disabled">
            </cs-ace-editor>
        </div>
    `,
    styleUrls: ["./math-editor.component.scss"],
})
export class MathEditorComponent implements OnInit, IEditor {
    latexInputControl = new FormControl("");
    @ViewChild("latexInput") latexInput!: ElementRef<HTMLTextAreaElement>;

    @ViewChild("visualInput") visualInput!: ElementRef<HTMLElement>;
    MQ!: IMathQuill;

    mathField!: MathFieldMethods;

    activeEditor: ActiveEditorType = ActiveEditorType.Visual;

    content: string = "";

    @ViewChild("aceEditor") aceEditor!: AceEditorComponent;

    // ACE editor settings
    @Input() placeholder: string = "";
    @Input() languageMode: string = "";
    @Input() disabled: boolean = false;
    @Input() minRows: number = 0;
    @Input() maxRows: number = 0;

    constructor() {}

    ngOnInit(): void {}

    focus(): void {}

    editHandler(field: any) {
        // write changes in visual field to latex field if visual field
        // was the one modified
        if (this.activeEditor === ActiveEditorType.Visual) {
            const latex = field.latex();
            this.latexInputControl.setValue(latex);
        }
    }

    enterHandler(field: any) {
        console.log("enter");
    }

    async loadMathQuill() {
        const elem = this.visualInput.nativeElement;
        elem.addEventListener("click", (e: MouseEvent) => {
            this.activeEditor = ActiveEditorType.Visual;
        });
        const config: MathQuillConfig = {
            spaceBehavesLikeTab: true,
            handlers: {
                edit: (field: any) => this.editHandler(field),
                enter: (field: any) => this.enterHandler(field),
            },
        };
        const mq = (await import("vendor/mathquill/mathquill")).default;
        this.MQ = mq.getInterface(2);

        this.mathField = this.MQ.MathField(elem, config);
    }

    ngAfterViewInit() {
        void this.loadMathQuill();
        this.aceEditor.content = "";
    }

    handleLatexFocus() {
        this.activeEditor = ActiveEditorType.Latex;
    }

    handleLatexInput() {
        // write changes in latex field to visual field if latex field
        // was the one modified
        if (this.latexInputControl.value) {
            this.mathField.latex(this.latexInputControl.value);
        }
    }

    handleFormulaOk() {
        if (this.mathField.latex) {
            const latexToAdd = this.mathField.latex();
            const dollars = "$$";
            const mathContent = `${dollars}\n${latexToAdd}\n${dollars}`;
            this.aceEditor.insert(mathContent);
        }
    }

    setReadOnly(b: boolean): void {}
}
