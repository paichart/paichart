/**
 * Registration policy — the three self-host knobs for who gets an account and with what role.
 * (2026-09-04, D7 commit B; panel: cline_docs/reviews/self-host-rbac-bootstrap-2026-09-04/SYNTHESIS.md)
 *
 * ALL THREE ARE NO-OPS WHEN THE VARIABLE IS UNSET — that is what keeps paichart.app byte-identical:
 *   DEFAULT_USER_ROLE   unset → 'DEMO_USER' (the SaaS default; a public read-only viewer)
 *                       'USER' → new sign-ups can create POVs and join teams (private installs)
 *   ALLOW_REGISTRATION  unset → true; 'false' closes /register AND OAuth first-login provisioning
 *   mail provider       self-registration by email needs one: the verification mail is how a user
 *                       sets a password. Without it the old code inserted an unverified row and
 *                       then 500'd — the row could never log in. Guard BEFORE the insert.
 *
 * Read at CALL time (functions, not module constants) so tests can vary env in-process and a
 * restart is still the only way to change behaviour in a running server. Zero imports.
 */

export type RegistrationRole = 'USER' | 'DEMO_USER';
type Env = { [key: string]: string | undefined };

/** Role for a brand-new account from /register or an OAuth first login. */
export function defaultUserRole(env: Env = process.env): RegistrationRole {
  const raw = (env.DEFAULT_USER_ROLE ?? '').trim().toUpperCase();
  if (!raw) return 'DEMO_USER';
  if (raw === 'USER' || raw === 'DEMO_USER') return raw;
  throw new Error(`DEFAULT_USER_ROLE must be USER or DEMO_USER (got "${env.DEFAULT_USER_ROLE}") — ADMIN roles are never a sign-up default`);
}

/** Whether new accounts may be created at all (password or OAuth). */
export function registrationAllowed(env: Env = process.env): boolean {
  const raw = (env.ALLOW_REGISTRATION ?? '').trim().toLowerCase();
  if (!raw) return true;
  return !['false', '0', 'no', 'off'].includes(raw);
}

/** Whether email-based self-registration can complete (a verification mail must be deliverable). */
export function mailProviderConfigured(env: Env = process.env): boolean {
  return (env.BREVO_API_KEY ?? '').trim().length > 0;
}
