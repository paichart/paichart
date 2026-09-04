/**
 * Validate an enum-typed query param before it reaches a Prisma enum filter.
 *
 * 2026-05-27 (pentest M-2 + sibling eradication): an `searchParams.get(...)` value
 * cast straight into a Prisma `where` on an enum column throws when out-of-range →
 * a generic 500 (not SQLi — Prisma parameterizes — just an unhandled robustness gap +
 * log noise). This returns the value only if it's a member of the enum; empty/missing/
 * invalid → `undefined` (drop the filter; never 500). Lenient by design so it's a safe
 * one-line drop-in across heterogeneous list routes without per-route error wiring.
 * (Callers wanting a strict 400 can compare a present raw value against an undefined return.)
 */
export function parseEnumParam<T extends Record<string, string>>(
  raw: string | null | undefined,
  enumObj: T,
): T[keyof T] | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  return (Object.values(enumObj) as string[]).includes(raw) ? (raw as T[keyof T]) : undefined;
}
