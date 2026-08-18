/**
 * String `format` predicates — the ONE source of truth shared by the
 * validator (`schema.ts`) and the inference sniffers (`infer.ts`). Keeping
 * them here (a tiny, dependency-free module) guarantees a sniffed format is
 * always a subset of the enforced one, so an inferred schema can never reject
 * its own sample — and keeps the `tosijs-schema/infer` subpath from dragging
 * in the validator.
 */
export const RX_EMOJI_ATOM = '\\p{Extended_Pictographic}'

export const FORMAT_VALIDATORS: Record<string, (v: string) => boolean> = {
  email: (v) => /^\S+@\S+\.\S+$/.test(v),
  uuid: (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  uri: (v) => {
    try {
      new URL(v)
      return true
    } catch {
      return false
    }
  },
  ipv4: (v) =>
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
      v
    ),
  'date-time': (v) => !isNaN(Date.parse(v)),
  emoji: (v) => new RegExp(RX_EMOJI_ATOM, 'u').test(v),
}

/** the formats `validate` actually enforces (and thus that inference may emit) */
export const ENFORCED_FORMATS: ReadonlySet<string> = new Set(
  Object.keys(FORMAT_VALIDATORS)
)
