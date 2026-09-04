## What
<!-- One or two sentences. Link the issue if there is one. -->

## Why
<!-- The problem this solves, or the behaviour it changes. -->

## How I verified it
<!-- Commands you ran and what they showed. "CI is green" is necessary, not sufficient. -->
- [ ] `npm run test:all-validation` green locally
- [ ] Touched `lib/auth/`? Read the relevant discovery under `.claude/knowledge/discoveries/` and ran its greps
- [ ] Touched schema? `prisma db push` (no migration files)
- [ ] No hard-coded origin/host — derives from `APP_BASE_URL` (`test:public-base-url` guards this)
- [ ] No secret-shaped strings added (secret scan runs on push)
