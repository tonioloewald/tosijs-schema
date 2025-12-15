export type Infer<S> = S extends {
    _type: infer T;
} ? T : never;
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
    schema: any;
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
}
declare const methods: {
    readonly email: Str;
    readonly uuid: Str;
    readonly ipv4: Str;
    readonly url: Str;
    readonly datetime: Str;
    readonly emoji: Str;
    readonly any: Base<any>;
    pattern: (r: RegExp | string) => Str;
    union: <T extends Base<any>[]>(schemas: T) => Base<Infer<T[number]>>;
    enum: <T extends string | number>(vals: T[]) => Base<T>;
    array: <T>(items: Base<T>) => Arr<T[]>;
    tuple: <T extends readonly [Base<any>, ...Base<any>[]]>(items: T) => Base<{ [K in keyof T]: T[K] extends Base<infer U> ? U : never; }>;
    object: <P extends Record<string, Base<any>>>(props: P) => Obj<SmartObject<{ [K in keyof P]: Infer<P[K]>; }>>;
    record: <T>(value: Base<T>) => Obj<Record<string, T>>;
};
type TinySchema = typeof methods & {
    string: Str;
    number: Num;
    integer: Num;
    boolean: Base<boolean>;
    any: Base<any>;
};
export declare const s: TinySchema;
export type ErrorHandler = (path: string, msg: string) => void;
export interface ValidateOptions {
    onError?: ErrorHandler;
    fullScan?: boolean;
}
export declare function validate(val: any, builderOrSchema: Base<any> | Record<string, any>, opts?: ValidateOptions | ErrorHandler): boolean;
export declare function diff(a: any, b: any): any;
export {};
