# Kept files on a self-hosted pAIchart

**Read this before you run pipelines on your own install: kept files are on by default.** It says what kept files store, where, for how long and who can read
them, the configuration they are designed for, and the operator facts that follow. It complements [`RUNNING.md`](RUNNING.md)
(installing) and [`VERIFYING-SELF-HOST.md`](VERIFYING-SELF-HOST.md) (identity).

## What kept files are

When a pipeline changes a configuration file you keep, the platform **keeps the exact bytes it read**. That covers a Kubernetes
manifest or a Terraform file in Git, a file a read-only service serves, or a network device's declared configuration.
- The agent writing the change never retypes the file; it writes small search-and-replace edits against a handle.
- The platform applies each edit (one that does not match exactly once is refused) and stores the result.
- The reviewer reads the platform's own diff.
- You receive a package with the edits, a rollback and the checks to run.

**Nothing is applied to your systems; applying is your step.**

**On by default in `.env.example`** (`HELD_BYTES_CAPTURE_ENABLED=true`, matching production; the code default is off, so an unset
variable means off, and `=false` turns it off). A file is kept only when a pipeline reads it through a service that declares it. That means a Git file source, a network device declared `device-read` in the task's `## Device sources` block, or a read-only
service whose registration declares held files (the hub registry's `heldFiles` field on `registry(action: "register")`, accepted on human registrations only).

## Reading kept files from Git (optional)

Kubernetes, Terraform and network pipelines can read the **file of record** from a Git repository, so the base the Author edits
is the committed file rather than a copy typed into a task. The hub reads Git through the shipped GitHub file source
(`services/github-service`): GitHub's official read-only MCP server plus a small proxy that adds your token. It is optional; skip it
until you have a config repo. Set-up is [install guide step 9c](INSTALL.md); the service's shape, rules and upgrade checks
are in [`services/github-service/README.md`](../services/github-service/README.md). To try it before pointing it at your own repo, pin
`paichart/paichart-configs`: public configuration files of record and released use cases that run against them.

- **The pin, not the token, is the boundary.** A GitHub token can read every public repo, so the hub lets agents read through this
  service from **one** repository only: `GIT_FILE_SOURCE_PIN=<owner>/<repo>` in the hub's `.env`. Only host configuration sets it —
  never a task, a spec or an agent (put it in `.env`, which both hub processes read — not `.env.production`). A call naming any other repo is refused (`PINNED_ARGUMENT`), and a file that does not come from
  the pin is never kept (`source-not-pinned`). A malformed value stops the hub's MCP server at startup on purpose.
- **Always the `main` branch.** Pipelines read `main`, and a read that names no branch is read as `main` — never as whatever the
  repo's default branch happens to be — so the repo **must have a `main` branch**. Protect it (pull requests only, review, no
  force-push) and make working changes on other branches. A commit or tag cannot be named.
- **What is recorded:** each file kept from Git carries the commit it was read at, so you can see exactly which version a package
  was built on.
- **More than one repo** (a team's own config repo beside yours): register a separate read-only service whose held-file declaration
  names its own repo — set only by a human registrant. Never register the pinned repo as a second source: its files are kept
  only through the pin.
- **Limits on a self-host.**
  - There is no independent operator check of a kept file against Git: the base-check tool stays private. Compare a package's base
    with the commit it names yourself before you apply it.
  - Changing the pin later governs **new reads only**: files already kept from the old repo stay usable (they are never re-checked
    against the pin) and still name the repo they came from. A new pin takes effect when the hub restarts, and a restart stops any
    run in flight — change it between runs.
  - Without a live read (no cluster, state or device service named), a pipeline checks against the Git file only, not the running
    system. The package's checks are then your apply-time check against reality.

## What is stored, where, and for how long

- **Stored:** for each kept file, the copy **as read** (`CAPTURE`), the **base** the edits apply to (`BASE`), and the **candidate** after
  the edits (`CANDIDATE`). Each copy has a SHA-256 hash. A **rendered view** of the file is also stored, for reviewers and the package.
- **Where:** in your pAIchart database (the `held_blobs`, `held_file_refs` and `held_views` tables). **Your database backups therefore
  contain your configuration files.** Protect and retain backups accordingly.
- **For how long:** copies belong to the execution that kept them and are removed when that execution is pruned. A nightly sweep
  deletes unreferenced copies after a one-day grace. There is no per-file delete.
- **Sent to your model provider:** the rendered view and the diff are part of what the reviewing and authoring agents read, so they
  are sent to the LLM provider your install uses.

## The configuration kept files are designed for

Run kept files with **both output guards on**. `.env.example` sets both on:

```bash
CONNECTED_OUTPUT_SANITIZE_ENABLED=true   # R9 — sanitise what connected services return before an agent reads it
ARTIFACT_SECRET_REDACT_ENABLED=true      # R10 — replace recognised secrets with a placeholder before anything is stored
```

The code defaults differ: **R9 runs only when set to `true`; R10 runs unless set to `false`.** Both are read at start, so restart the
processes after a change.

> **Installed before 2026-11-01? Check your `.env`.** Until that date `.env.example` set `ARTIFACT_SECRET_REDACT_ENABLED=false`, which
> turns R10 **off**. If you copied it, set it to `true` (or remove the line) and restart. Copies kept while R10 was off stay raw: their
> `redactorVersion` is `"none"`.

**What keeping R10 on costs you.** Where R10 replaced a secret in a kept file, that copy contains a placeholder, and `held.get` reports
`applicable: false`, `mode: "diff-only"` for it. The stored candidate cannot then be written over your file as it is. Apply the
package's **edits** to your own copy of the file instead, and before you apply, confirm that your live file still matches the stored
**BASE**.

## Operator facts

1. **With R10 off, every reader of the POV, and your model provider, sees the secrets in your kept files.** With R10 off, the stored
   copy is the raw file (`redactorVersion: "none"`). Its rendered view is built from that copy: unchanged if R9 is also off, otherwise
   only sanitised against injected instructions. That view reaches task and artifact reads and the agents' prompts, so anyone who can read
   the POV, and the model provider, can read any secret in the file. The copy's hash adds a second, smaller exposure: it is of the raw
   file, so whoever can see it (`held.get` callers, and anyone with database or backup access) can test a guessed secret against it.
   With R10 on, the secrets it **recognises** are replaced before storage, and `redactedCount` on the copy says how many. A secret in a
   shape it does not recognise stays in the file. **Keep R10 on, and keep credentials out of the files you hand to pipelines where you
   can.**

2. **`held.get` returns the exact stored bytes, deliberately unsanitised.** It is the operator's integrity read: it checks the bytes
   against their hash and returns them verbatim, without R9's cleaning. Treat its output as untrusted file content. On the HTTP transport,
   only signed-in users with access to the POV can call it (ADMIN and SUPER_ADMIN can read any POV), and demo users and demo POVs are
   refused. Agents can never call it. A permitted read writes an Activity record **before** any content is returned (the POV, the
   execution, the copy and its kind; never the content, never the hash). If that record cannot be written, the read is refused. A refused
   call writes no record.

3. **Anyone who can read a POV's tasks can see its kept-file views.** The rendered view reaches reviewers and the package through
   ordinary task and artifact reads, which write no Activity record. Scope POV membership the way you would scope access to the
   configuration itself.

4. **Reading a specific stored copy.** `held.get` takes either `refId`, or `executionId` + `handle` + `kind` (`CAPTURE` — as read,
   `BASE` — the version the edits apply to, `CANDIDATE` — after the edits). Use `refId` when a handle is ambiguous. `refId`s appear in
   `held.get` responses and in the author execution's `edit-application.manifest.json` artifact. A file that was not kept has no stored
   copy to read.

5. **Over stdio, the MCP server is as trusted as your database credentials.** The stdio transport takes its identity from
   `PAICHART_API_KEY` **without verifying its signature**. A key with no role, or one that is not a JWT, runs as ADMIN, so `held.get` over
   stdio can read every POV's kept files. The real boundary is who holds `DATABASE_URL` and that key. Run the stdio server only for a
   single trusted operator on a machine they control. For a team, use the HTTP transport, where every call is authenticated and checked
   against POV access.

## Quick check after a pipeline keeps a file

- After a pipeline that keeps a file, read its candidate:
  `project({ action: "held.get", executionId: "<author execution>", handle: "H1", kind: "CANDIDATE" })`.
- The response's `redactorVersion` should be a version (`paichart.r10/…`), **not `"none"`**. `"none"` means R10 was off when the file
  was kept: see operator fact 1.
