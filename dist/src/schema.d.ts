export type Infer<S> = S extends {
    _type: infer T;
} ? T : never;
interface Base<T> {
    schema: any;
    _type: T;
    get optional(): Base<T | undefined>;
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
    union: <T extends Base<any>[]>(schemas: T) => Base<Infer<T[number]>>;
    enum: <T extends string | number>(vals: T[]) => Base<T>;
    array: <T>(items: Base<T>) => Arr<T[]>;
    tuple: <T extends [Base<any>, ...Base<any>[]]>(items: T) => Base<{ [K in keyof T]: Infer<T[K]>; }>;
    object: <P extends Record<string, Base<any>>>(props: P) => Obj<{ [K in keyof P]: Infer<P[K]>; }>;
    record: <T>(value: Base<T>) => Obj<Record<string, T>>;
};
type TinySchema = typeof methods & {
    string: Str;
    number: Num;
    integer: Num;
    boolean: Base<boolean>;
};
export declare const s: TinySchema;
export type ErrorHandler = (path: string, msg: string) => void;
export interface ValidateOptions {
    onError?: ErrorHandler;
    fullScan?: boolean;
}
export declare function validate(val: any, schema: any, opts?: ValidateOptions | ErrorHandler): boolean;
export declare function diff(a: any, b: any): any;
export {};
