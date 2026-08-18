/**
 * Derive a JSON Schema from example data (data → schema, the runtime inverse
 * of `Infer<S>`'s schema → type). Structure only, open by default.
 *
 * Tree-shakeable by design: this module's only runtime import is the tiny
 * shared `./formats` (the format predicates it shares with the validator, so a
 * sniffed format can never reject its own sample). It never imports the
 * builder/validator/contract, so `import { inferSchema } from 'tosijs-schema'`
 * (or the `tosijs-schema/infer` subpath) stays ~1.3kB.
 */
import type { JSONSchema } from './schema';
export interface InferOptions {
    /**
     * Sniff string `format` (`date-time`, `date`, `email`, `uri`). Off by
     * default. When on, a format is emitted only if EVERY non-null value at
     * that position matches it — never a majority vote (a sample's near-misses
     * are the domain's edge cases).
     */
    formats?: boolean;
    /**
     * Propose `enum` for low-cardinality string/number fields. Off by default.
     * `true` uses the defaults below; an object tunes them. A field becomes an
     * enum only if it has ≤ `maxDistinct` distinct values AND those values
     * repeat enough that `coverage` (1 − distinct/samples) ≥ `minCoverage` —
     * otherwise a 3-row fixture turns an id column into an enum of three ids.
     */
    enums?: boolean | {
        maxDistinct?: number;
        minCoverage?: number;
    };
    /**
     * Cap how many array elements are unified. Unset = sample everything (the
     * default; the whole point is not to miss a key that's absent from row 0).
     * When set and the input exceeds it, `onTruncate` fires — inference never
     * silently reads "everything" when it didn't.
     */
    sampleSize?: number;
    /** Called (once per truncated array) when `sampleSize` drops elements. */
    onTruncate?: (info: {
        path: string;
        sampled: number;
        total: number;
    }) => void;
    /**
     * Stamp the root of the result with `$inferred: true`, so a consumer can
     * tell an *observed* schema from an *authored* one — the same `{ type:
     * 'integer' }` means "a sample looked like this" vs "someone promised
     * this", and a reader (agent, form editor, gate) must not mistake one for
     * the other. On by default; set `false` for a clean schema to hand-edit
     * (promoting an inferred schema to a declared one = dropping the marker).
     */
    marker?: boolean;
}
/**
 * Derive a JSON Schema from a sample of data. Structure only — never infers
 * `minimum`/`maxLength`/etc. from observed ranges (a sample's extremes are not
 * the domain's). Objects are OPEN (`additionalProperties: true`): the schema
 * describes a sample, not a contract. Total on empty/degenerate input.
 *
 * The output is plain, editable JSON Schema — the workflow is "infer, then
 * refine". Guarantee: `validate(sample, inferSchema(sample))` is always true.
 *
 * @example
 * inferSchema([{ id: 1, tag: 'a' }, { id: 2 }])
 * // { type: 'array', items: {
 * //     type: 'object',
 * //     properties: { id: { type: 'integer' }, tag: { type: 'string' } },
 * //     required: ['id'],            // tag absent from row 2 → optional
 * //     additionalProperties: true } }
 */
export declare function inferSchema(sample: unknown, opts?: InferOptions): JSONSchema;
