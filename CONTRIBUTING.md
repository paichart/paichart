# Contributing to pAIchart

Thanks for looking. This is a small project with a high bar for correctness in the auth and
orchestration layers, so a few things up front.

## Before you start
- **Run it first**: [docs/RUNNING.md](docs/RUNNING.md) gets you from clone to a logged-in install in
  seven commands; [docs/VERIFYING-SELF-HOST.md](docs/VERIFYING-SELF-HOST.md) proves the install owns its
  identity. If either doc is wrong on your machine, that is a bug — open an issue with the step number.
- **Read before you change**: the codebase is documented through *discovery prompts* and *specialist
  notes* under `.claude/knowledge/` (e.g. `discoveries/auth-permissions-discovery.md` before touching
  `lib/auth/`). They carry verified `grep` commands with expected counts; run them, don't trust them.

## Ground rules that CI enforces
- `npm run test:all-validation` must be green. It includes `test:security-invariants` (pentest-hardened
  pins — a red one is a regression, not noise), `test:public-base-url` (the deployment's identity derives
  from `APP_BASE_URL`; never hard-code the origin), and `test:registration-policy`.
- `npm run lint` and a secret scan (`gitleaks`, config in `.gitleaks.toml`) run on every push and PR.
  A secret-shaped string in a doc or test fixture fails the build; put provably-fake values on the
  allowlist **with the reason**, never real ones anywhere.
- Schema changes go through `prisma db push` (schema is the single source of truth). Do not add
  migration files.

## Things that are deliberately the way they are
- Token issuer and audiences derive from one module (`lib/auth/public-base-url.ts`); the OAuth callback
  audience is a locked invariant (see the file header of `lib/mcp/server/routes/oauth-flow-routes.ts`).
  Changes there need a written rationale in the PR.
- The `system` sentinel user, the `DEMO_USER` role and the demo-POV visibility rules exist for the
  hosted service; self-hosts control them with `DEFAULT_USER_ROLE` / `ALLOW_REGISTRATION` rather than
  by removing them.
- Server-management scripts (monitors, deploy, backups) are intentionally not in this repository.

## Pull requests
- Small and single-purpose. Say what you verified, not just what you changed.
- New behaviour comes with a test that fails without it; a fixed bug comes with the failing case.
- No AI co-author trailers in commits.

## Security
Please do not open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
