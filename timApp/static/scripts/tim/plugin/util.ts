import {IController, IRootElementService, IScope} from "angular";
import {Left} from "fp-ts/lib/Either";
import * as t from "io-ts";
import {Type} from "io-ts/lib";
import {Binding} from "../util/utils";

export interface IPluginAttributes<Markup extends IGenericPluginMarkup, State> {
    markup: Markup;
    doLazy: boolean;
    anonymous: boolean;
    info: {};
    preview: boolean;
    show_result: boolean; // not in csplugin
    state: State | null; // not in csplugin
    targetFormat: string;
    taskID: string;
    taskIDExt: string;
    userPrint: boolean;
}

// Attributes that are valid for all plugins.
export const GenericPluginMarkup = t.partial({
    answerLimit: t.Integer,
    button: nullable(t.string),
    buttonText: nullable(t.string),
    footer: t.string,
    header: nullable(t.string),
    lazy: t.boolean,
    resetText: nullable(t.string),
    stem: nullable(t.string),
});

export interface IGenericPluginMarkup extends t.TypeOf<typeof GenericPluginMarkup> {
    // should be empty
}

export function getDefaults<MarkupType extends IGenericPluginMarkup,
    A extends {markup: MarkupType},
    T extends Type<A>>(runtimeType: T, defaultMarkup: MarkupType) {
    const d = runtimeType.decode({markup: defaultMarkup, info: null});
    if (d.isLeft()) {
        throw new Error("Could not get default markup");
    }
    return d.value;
}

function getEssentialContext(c: t.Context) {
    for (let i = c.length - 1; i >= 0; i--) {
        if (isNaN(parseInt(c[i].key, 10)) || c[i].type.name.startsWith("xxwsdx")) {
            return c.slice(0, i + 1);
        }
    }
    return c;
}

type MarkupError = Array<{name: string, type: string}>;

function isPrefixOfSome(s: string, others: string[]) {
    for (const o of others) {
        if (o.startsWith(s + ".")) {
            return true;
        }
    }
    return false;
}

function getErrors<A>(v: Left<t.Errors, A>): MarkupError {
    const ps: Array<[string[], string]> = v.value
        .filter((e) => e.context.length >= 3 && e.context[0].key === "" && e.context[1].key === "markup")
        .map((error) => getEssentialContext(error.context))
        .map((error) => [error.slice(2).map((x) => x.key), error[error.length - 1].type.name] as [string[], string]);
    const errs = new Map<string, Set<string>>();
    const knownKeys = ps.map(([keys, _]) => keys.join("."));
    for (let [keys, type] of ps) {
        const key = keys.join(".");
        // don't report parent fields because it's not useful
        if (isPrefixOfSome(key, knownKeys)) {
            continue;
        }
        // avoid too verbose messages
        if (type.length > 50) {
            type = "valid object";
        }
        if (type.startsWith("(") && type.endsWith(")")) {
            type = type.slice(1, type.length - 1);
        }
        type = type.replace(/ \| /g, " or ");
        const vals = errs.get(key);
        if (vals == null) {
            errs.set(key, new Set([type]));
        } else {
            vals.add(type);
        }
    }
    const result = [];
    for (const [key, types] of errs.entries()) {
        result.push({type: Array.from(types).join(" or "), name: key});
    }
    return result;
}

export class PluginMeta {
    constructor(private element: IRootElementService) {

    }

    protected getParentAttr(name: string) {
        return this.element.parent().attr(name);
    }

    public getTaskId() {
        return this.getParentAttr("id");
    }

    protected getPlugin() {
        return this.getParentAttr("data-plugin");
    }

    public getAnswerUrl() {
        const plugin = this.getPlugin();
        if (!plugin) {
            const message = "Could not find plugin type from HTML";
            alert(message);
            throw new Error(message);
        }
        let url = plugin;
        const i = url.lastIndexOf("/");
        if (i > 0) {
            url = url.substring(i);
        }
        url += `/${this.getTaskId()}/answer/`;
        return url;
    }
}

/**
 * Base class for plugins.
 *
 * All properties or fields having a one-time binding in template should eventually return a non-undefined value.
 * That's why there are "|| null"s in several places.
 */
export abstract class PluginBase<MarkupType extends IGenericPluginMarkup, A extends {markup: MarkupType}, T extends Type<A>> implements IController {
    private static $inject = ["$scope", "$element"];

    buttonText() {
        return this.attrs.button || this.attrs.buttonText || null;
    }

    get attrs(): Readonly<MarkupType> {
        return this.attrsall.markup;
    }

    get footer() {
        return this.attrs.footer || null;
    }

    get header() {
        return this.attrs.header || null;
    }

    get stem() {
        return this.attrs.stem || null;
    }

    // Parsed form of json binding or default value if json was not valid.
    public attrsall: Readonly<A>;
    // Binding that has all the data as a JSON string.
    protected json!: Binding<string, "@">;

    protected markupError?: Array<{name: string, type: string}>;
    protected pluginMeta: PluginMeta;

    constructor(
        protected scope: IScope,
        protected element: IRootElementService) {
        this.attrsall = getDefaults(this.getAttributeType(), this.getDefaultMarkup());
        this.pluginMeta = new PluginMeta(element);
    }

    abstract getDefaultMarkup(): Partial<MarkupType>;

    $postLink() {
    }

    $onInit() {
        const parsed = JSON.parse(atob(this.json)) as unknown;
        const validated = this.getAttributeType().decode(parsed);
        if (validated.isLeft()) {
            this.markupError = getErrors(validated);
        } else {
            this.attrsall = validated.value;
        }

        // These can be uncommented for debugging:
        // console.log(parsed);
        // console.log(this);
    }

    protected abstract getAttributeType(): T;

    protected getRootElement() {
        return this.element[0];
    }
}

// from https://github.com/teamdigitale/italia-ts-commons/blob/de4d85a2a1502da54f78aace8c6d7b263803f115/src/types.ts
export function withDefault<T extends t.Any>(
    type: T,
    defaultValue: t.TypeOf<T>,
): t.Type<t.TypeOf<T>, any> {
    return new t.Type(
        type.name,
        (v: any): v is T => type.is(v),
        (v: any, c: any) =>
            type.validate(v !== undefined && v !== null ? v : defaultValue, c),
        (v: any) => type.encode(v),
    );
}

export function nullable<T extends t.Any>(type: T) {
    return t.union([t.null, type]);
}
