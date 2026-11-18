/**
 * The Plan witness STOP SENTENCE — one constant per protocol version, in a module that imports NOTHING.
 *
 * It lives apart from plan-witness.ts because the protocol seed interpolates it, and the deploy compiles the seed under its own
 * config (prisma/tsconfig.seed.json: no path aliases, an older lib). Anything the seed imports is compiled there with everything
 * it reaches, type imports included; plan-witness.ts reaches held-bytes/apply.ts, which does not compile under that config
 * (test:seed-config-compiles, 2026-11-19). plan-witness.ts re-exports everything here, so there is still ONE definition.
 */
export const TERRAFORM_PROTOCOL = 'terraform-iac-protocol';
/** program-protocol.ts `canonicalProtocolName`'s pure suffix rule, restated so this module imports nothing at runtime (pinned equal). */
export const canonical = (name: string): string => (name.endsWith('-protocol') ? name : `${name}-protocol`);

/**
 * THE stop sentence, per protocol and per protocol version it was released with. The seed interpolates
 * `planWitnessStopSentenceFor('terraform-iac', '<version>')`; the check reads the entry for the version the Author composed (the
 * greatest entry at or below it), so a later rewording never re-reads a stored package against a sentence it was not given.
 */
export const PLAN_WITNESS_STOP_SENTENCES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  [TERRAFORM_PROTOCOL]: Object.freeze({
    '1.17.0': "If the team's CI plan takes any other action on these resources, changes any other attribute or map key of a resource it updates in place — a revert included — or touches any other resource, stop and do not apply: the plan does more than this package changes, and the difference must be explained first (a change made outside this package, a provider or module change, or another merged change).",
  }),
});

/** For the seed: the sentence released with exactly this protocol version. Throws on an unknown pair (a seed typo must not ship). */
export function planWitnessStopSentenceFor(protocol: string, version: string): string {
  const s = PLAN_WITNESS_STOP_SENTENCES[canonical(protocol)]?.[version];
  if (typeof s !== 'string') throw new Error(`no Plan witness stop sentence for ${protocol} ${version}`);
  return s;
}
