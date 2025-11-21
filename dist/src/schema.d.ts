export type Infer<S> = S extends {
    _type: infer T;
} ? T : never;
interface Base<T> {
    schema: any;
    _type: T;
    get optional(): Base<T | undefined>;
}
interface Str<T = string> extends Base<T> {
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
    min(val: number): Num<T>;
    max(val: number): Num<T>;
    step(val: number): Num<T>;
    get int(): Num<T>;
}
interface Arr<T> extends Base<T> {
    min(count: number): Arr<T>;
    max(count: number): Arr<T>;
}
declare const methods: {
    union: <T extends Base<any>[]>(schemas: T) => Base<Infer<T[number]>>;
    enum: <T extends string | number>(vals: T[]) => Base<T>;
    array: <T>(items: Base<T>) => Arr<T[]>;
    object: <P extends Record<string, Base<any>>>(props: P) => Base<{ [K in keyof P]: Infer<P[K]>; }>;
};
type TinySchema = typeof methods & {
    string: Str;
    number: Num;
    boolean: Base<boolean>;
};
export declare const s: TinySchema;
export declare function validate(val: any, schema: any): boolean;
export declare function diff(a: any, b: any): any;
export {};
