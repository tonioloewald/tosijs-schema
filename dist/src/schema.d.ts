import { ENFORCED_FORMATS } from './formats';
export { ENFORCED_FORMATS };
export type Infer<S> = S extends {
    _type: infer T;
} ? T : never;
export interface JSONSchema {
    type?: string | string[];
    properties?: Record<string, JSONSchema>;
    additionalProperties?: boolean | JSONSchema;
    items?: JSONSchema;
    /** typed for interop but NOT enforced by validate (agentContract refuses it) */
    prefixItems?: JSONSchema[];
    required?: string[];
    enum?: readonly unknown[];
    const?: unknown;
    anyOf?: JSONSchema[];
    allOf?: JSONSchema[];
    oneOf?: JSONSchema[];
    not?: JSONSchema;
    minimum?: number;
    maximum?: number;
    exclusiveMinimum?: number;
    exclusiveMaximum?: number;
    multipleOf?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    minItems?: number;
    maxItems?: number;
    minProperties?: number;
    maxProperties?: number;
    title?: string;
    description?: string;
    default?: unknown;
    examples?: unknown[];
    $ref?: string;
    $defs?: Record<string, JSONSchema>;
    $schema?: string;
    /**
     * Computational validation (progressive enhancement). The value is the
     * *source* of a predicate (conceptually: takes the value at this node,
     * returns boolean) — the "computational half" plain JSON Schema can't
     * express (open value grammars, recursive structure). The exact source
     * format is defined by the registered evaluator, pending a specification
     * from the canonical engine (tjs-lang).
     *
     * A naive validator ignores this keyword and checks only the structural part.
     * A predicate-aware one runs it — but only when an evaluator has been
     * registered via {@link setPredicateEvaluator}, so this library stays zero-dep
     * (the predicate engine lives in the consumer, e.g. `tjs-lang`).
     *
     * Predicates run against TYPE-VALID values only and never against
     * `null`/`undefined` (those are settled by `type` first) — encode
     * null-handling in the type, not the predicate.
     */
    $predicate?: string;
    /**
     * Values this schema must REFUSE (convention, paired with the standard
     * `examples` keyword): a gate that never says no isn't a gate. Exercised by
     * {@link checkExamples} and by contract harnesses (e.g. tosijs's
     * `exerciseContract`). Like all unknown `$`-prefixed keys, ignored by
     * {@link validate}.
     */
    $counterexamples?: unknown[];
    /**
     * Marks a schema as OBSERVED (derived by {@link inferSchema} from a sample)
     * rather than AUTHORED — so a reader can tell "a sample looked like this"
     * from "someone promised this". A pure annotation: ignored by
     * {@link validate}, allowed through `agentContract`.
     */
    $inferred?: boolean;
    [key: `x-${string}`]: unknown;
    [key: `$${string}`]: unknown;
}
/**
 * Evaluates a `$predicate` source against a value. Registered by a consumer that
 * has a predicate engine (e.g. `tjs-lang`'s `createPredicateEvaluator()`), so
 * this library carries no such dependency. Must fail closed (return `false`) on
 * an unverifiable/unsafe source rather than throw.
 */
export type PredicateEvaluator = (source: string, value: unknown) => boolean;
/**
 * Register (or clear, with `null`) the evaluator used for the `$predicate`
 * keyword. Until one is set, `$predicate` is ignored and validation is purely
 * structural (progressive enhancement). Returns the previous evaluator.
 */
export declare function setPredicateEvaluator(fn: PredicateEvaluator | null): PredicateEvaluator | null;
/** The currently-registered `$predicate` evaluator, if any. */
export declare function getPredicateEvaluator(): PredicateEvaluator | null;
type OptionalKeys<T> = {
    [K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];
type RequiredKeys<T> = {
    [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];
type SmartObject<T> = {
    [K in OptionalKeys<T>]?: T[K];
} & {
    [K in RequiredKeys<T>]: T[K];
} extends infer O ? {
    [K in keyof O]: O[K];
} : never;
export interface Base<T> {
    schema: JSONSchema;
    _type: T;
    get optional(): Base<T | undefined>;
    validate(val: any, opts?: ValidateOptions | ErrorHandler): boolean;
    title(t: string): Base<T>;
    describe(d: string): Base<T>;
    default(v: T): Base<T>;
    meta(m: Record<string, any>): Base<T>;
}
interface Str<T = string> extends Base<T> {
    title(t: string): Str<T>;
    describe(d: string): Str<T>;
    default(v: T): Str<T>;
    meta(m: Record<string, any>): Str<T>;
    min(len: number): Str<T>;
    max(len: number): Str<T>;
    pattern(r: RegExp | string): Str<T>;
    get email(): Str<T>;
    get uuid(): Str<T>;
    get ipv4(): Str<T>;
    get url(): Str<T>;
    get datetime(): Str<T>;
    get emoji(): Str<T>;
}
interface Num<T = number> extends Base<T> {
    title(t: string): Num<T>;
    describe(d: string): Num<T>;
    default(v: T): Num<T>;
    meta(m: Record<string, any>): Num<T>;
    min(val: number): Num<T>;
    max(val: number): Num<T>;
    step(val: number): Num<T>;
    get int(): Num<T>;
}
interface Arr<T> extends Base<T> {
    title(t: string): Arr<T>;
    describe(d: string): Arr<T>;
    default(v: T): Arr<T>;
    meta(m: Record<string, any>): Arr<T>;
    min(count: number): Arr<T>;
    max(count: number): Arr<T>;
}
interface Obj<T> extends Base<T> {
    title(t: string): Obj<T>;
    describe(d: string): Obj<T>;
    default(v: T): Obj<T>;
    meta(m: Record<string, any>): Obj<T>;
    min(count: number): Obj<T>;
    max(count: number): Obj<T>;
    /** keep the declared fields, admit unknown ones (`additionalProperties: true`) */
    get open(): Obj<T>;
}
declare const methods: {
    readonly email: Str;
    readonly uuid: Str;
    readonly ipv4: Str;
    readonly url: Str;
    readonly datetime: Str;
    readonly emoji: Str;
    readonly null: Base<null>;
    readonly undefined: Base<undefined>;
    readonly any: Base<any>;
    pattern: (r: RegExp | string) => Str;
    union: <T extends Base<any>[]>(schemas: T) => Base<Infer<T[number]>>;
    enum: <T extends string | number>(vals: T[]) => Base<T>;
    const: <T extends string | number | boolean | null>(val: T) => Base<T>;
    array: <T>(items: Base<T>) => Arr<T[]>;
    tuple: <T extends readonly [Base<any>, ...Base<any>[]]>(items: T) => Base<{ [K in keyof T]: T[K] extends Base<infer U> ? U : never; }>;
    object: <P extends Record<string, Base<any>>>(props: P, options?: {
        additionalProperties?: boolean;
    }) => Obj<SmartObject<{ [K in keyof P]: Infer<P[K]>; }>>;
    record: <T>(value: Base<T>) => Obj<Record<string, T>>;
    /**
     * @deprecated Legacy: samples only the first array element and closes
     * objects (`additionalProperties: false`). Use `inferSchema` (from
     * `tosijs-schema` / `tosijs-schema/infer`), which unifies across every
     * element and leaves objects open.
     */
    infer: (value: any) => Base<any>;
};
type TinySchema = typeof methods & {
    string: Str;
    number: Num;
    integer: Num;
    boolean: Base<boolean>;
    null: Base<null>;
    undefined: Base<undefined>;
    any: Base<any>;
};
export declare const s: TinySchema;
/**
 * Every keyword `validate`'s walk actually reads. Lives beside the walk so
 * the two cannot drift silently — `agentContract` refuses any schema key
 * outside this set (plus annotations and `x-*`) at construction, which is
 * what keeps typos and unimplemented keywords from shipping as advertised
 * constraints that enforce nothing.
 */
export declare const ENFORCED_KEYWORDS: ReadonlySet<string>;
export type ErrorHandler = (path: string, msg: string) => void;
export interface ValidateOptions {
    onError?: ErrorHandler;
    /** Enable strict validation: no stride sampling, enforces maxProperties. */
    strict?: boolean;
    /** @deprecated Use `strict` instead. */
    fullScan?: boolean;
}
export declare function validate(val: any, builderOrSchema: Base<any> | Record<string, any> | boolean, opts?: ValidateOptions | ErrorHandler): boolean;
export interface FilterOptions {
    onError?: ErrorHandler;
    /** Enable strict validation: no stride sampling, enforces maxProperties. */
    strict?: boolean;
    /** @deprecated Use `strict` instead. */
    fullScan?: boolean;
    skipValidation?: boolean;
}
export declare function filter(data: any, builderOrSchema: Base<any> | Record<string, any> | boolean, opts?: FilterOptions | ErrorHandler): any;
export declare function diff(a: any, b: any): any;
