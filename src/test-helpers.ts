// Shared test fixtures. Not shipped (not re-exported from index.ts) and kept
// out of the coverage table by bunfig.toml.

/**
 * Validation samples arrays and dictionaries longer than 97 items at a
 * prime stride of 97 (see `validate`). Index 3 is never sampled, so a bad
 * value there passes the default sampled mode and must fail `{ strict: true }`.
 * Use it to prove that strict mode reaches a code path.
 */
export const STRIDE = 97
export const UNSAMPLED_INDEX = 3

export const unsampledBadArray = (bad: unknown = 'bad', length = 500): any[] => {
  const arr: any[] = Array.from({ length }, (_, i) => i)
  arr[UNSAMPLED_INDEX] = bad
  return arr
}
