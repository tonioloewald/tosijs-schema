/**
 * String `format` predicates — the ONE source of truth shared by the
 * validator (`schema.ts`) and the inference sniffers (`infer.ts`). Keeping
 * them here (a tiny, dependency-free module) guarantees a sniffed format is
 * always a subset of the enforced one, so an inferred schema can never reject
 * its own sample — and keeps the `tosijs-schema/infer` subpath from dragging
 * in the validator.
 */
export declare const RX_EMOJI_ATOM = "\\p{Extended_Pictographic}";
export declare const FORMAT_VALIDATORS: Record<string, (v: string) => boolean>;
/** the formats `validate` actually enforces (and thus that inference may emit) */
export declare const ENFORCED_FORMATS: ReadonlySet<string>;
