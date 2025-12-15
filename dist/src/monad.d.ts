import { type Base, type Infer } from './schema';
export declare class SchemaError extends Error {
    kind: 'Input' | 'Output';
    functionName: string;
    violations: string[];
    constructor(kind: 'Input' | 'Output', functionName: string, violations?: string[]);
}
export type GuardedFunc<I, O> = {
    (input: I): Promise<O>;
    input: Base<I>;
    output: Base<O>;
    impl: (input: I) => Promise<O> | O;
    _isGuarded: true;
};
type Chain<Val, Registry> = {
    result: () => Promise<Val>;
} & {
    [K in keyof Registry]: Registry[K] extends GuardedFunc<infer I, infer O> ? Val extends I ? () => Chain<O, Registry> : never : never;
};
type MBuilder<Registry> = {
    [K in keyof Registry]: Registry[K] extends GuardedFunc<infer I, infer O> ? (input: I) => Chain<O, Registry> : never;
};
export declare class M<R extends Record<string, GuardedFunc<any, any>>> {
    private registry;
    constructor(registry: R);
    static func<I extends Base<any>, O extends Base<any>>(inputSchema: I, outputSchema: O, impl: (data: Infer<I>) => Promise<Infer<O>> | Infer<O>): GuardedFunc<Infer<I>, Infer<O>>;
    private start;
    private createChain;
}
export declare const createM: <R extends Record<string, GuardedFunc<any, any>>>(r: R) => MBuilder<R>;
export {};
