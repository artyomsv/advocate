/**
 * Shared utility types for the engine.
 */

/**
 * Nominal (branded) type helper. Adds a unique tag to a primitive so the
 * type checker treats it distinctly. Zero runtime cost.
 *
 * @example
 * type UserId = Brand<string, 'UserId'>;
 * const id: UserId = 'abc' as UserId;
 */
export type Brand<Base, Tag extends string> = Base & { readonly __brand: Tag };

/**
 * Recursively marks all properties readonly.
 */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * ISO-8601 timestamp string. Use this at module boundaries where Date objects
 * would be lost to JSON serialization (e.g., messages across the wire).
 */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;

export function isoNow(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp;
}
