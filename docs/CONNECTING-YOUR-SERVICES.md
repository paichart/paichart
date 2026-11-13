# Connecting your own services

How to register your team's device, Git and cloud services with your install, share them with colleagues' pipelines, and name
them in a pipeline task or a program spec. The install guide registers the two services a first run needs
([INSTALL.md](INSTALL.md) steps 9 to 9c); this page is for your own. Terms are in [GLOSSARY.md](GLOSSARY.md).

Most deployments are internal: one person registers the team's device, Git and cloud services, and many engineers run
pipelines against them. This guide says what that setup needs. **Applying a change is always yours**; the pipelines are
read-only and produce a change package. **Your services' security is your responsibility.**

## 1. Register your services

- **Register by descriptor URL** (`registry(action:'register', descriptorUrl:'<url>')`). The platform fetches the descriptor,
  validates it, and takes the service name and every field from it. Do not type a name or other field beside the URL: a
  field that differs from the descriptor is refused (`DESCRIPTOR_FIELD_DISAGREES`).
- **Descriptor rules** — the registration is refused otherwise:
  - every tool `description` is **500 characters or fewer**;
  - https on any port (plain http only where your operator enables `DESCRIPTOR_FETCH_ALLOW_HTTP`, self-host only — see
    §4); no redirects;
  - a host on your private network is fetched only if your operator lists it in `HUB_PRIVATE_ENDPOINT_ALLOWLIST`.
- **Tokens:** if the descriptor host needs one, put it in the URL's **query string, never the path** — a token in the path
  cannot be detected or masked. A query string is accepted only when a **person** registers the service (never a pipeline),
  and the stored URL keeps the query keys with every value masked. Use a read-only, single-repository, short-lived token.
- **Kept (held) files** are declared only in the descriptor's `heldFiles`. A pipeline can never write that declaration.
  *Network (since 2026-10-27, network-provisioning 1.25.0):* on an unpinned Git service, the task's declared `git-file` line is the
  pin — only a read equal to that line (owner/repo/path, its ref or `main`) is kept; the declaration is snapshotted
  when the leg first runs, so the run cannot rewrite it.
- **Declaring network devices (most teams: Git files only):** each device the leg changes OR must see gets a line — a switch needed only
  for its allocations is declared `git-file` too (kept, never edited). A Git-only device cannot reveal anything configured on the
  device but never committed to Git. ⚠️ A device you leave out is not checked by that leg at all, and its Reviewer may approve a
  value that collides there (known limitation, accepted 2026-11-05) — when in doubt, list it. See [PIPELINES.md](PIPELINES.md),
  "Which devices to list".
- **Changing a descriptor:** delete the service and register it again from the new URL (no refresh action yet).

## 2. Let your colleagues' pipelines use a shared service

A service is owned by the person who registered it. A colleague's pipeline can read a service you share publicly, but the
platform keeps (holds) its files only for the owner — unless you grant a POV:

- **Hosted:** the owner runs `registry(action:'update', serviceId:'<id>', updates:{ heldGrantPovIds:['<POV id>'] })`. Up to
  20 POVs the owner is a member of (not demo POVs). A pipeline running in a granted POV, launched by a member of that POV,
  reads and holds the service as if it were the owner's. Removing someone from the POV stops their grant at the next call.
- **Self-host:** your operator can set `HELD_ELIGIBILITY_INSTALL_WIDE=true` so every user of the install counts as the same
  customer for holding (access itself is unchanged).
- A pipeline may update or delete only a service its launching user owns.

## 3. Write the pipeline task or requirements

- **Name the service** your pipeline should read — by its registered name (used as-is: the run never registers, updates or
  deletes it) or by descriptor URL (registered for that run and removed at its end). A pipeline never chooses the source of
  your configuration for you.
- **Network change pipelines (from network-provisioning 1.23.0):** declare each device's source in a `## Device sources`
  block, one line per device:
  - `<device>: git-file — service <name | descriptor URL> ; <owner>/<repo>/<path> [@ <branch|tag|commit>]`
  - `<device>: device-read — service <name | descriptor URL>`
  - `<device>: live-read — service <name | descriptor URL>` (from network-provisioning 1.26.0: a device the leg must see but
    never changes — read whole as evidence, never kept or edited, alone on its device)
  - `<device>: command-package`

  A device the change touches with no line stops the leg. A device left out of the block is not checked by that leg, and its
  Reviewer may approve a value that clashes with it (a known limitation): list every device a leg must see, not only the ones it
  changes ([PIPELINES.md](PIPELINES.md), "Which devices to list"). A device may have both a `git-file` and a `device-read` line: the Git file is the
  base and the device read is quoted as evidence only; the agents do not compare them (`drift: not checked`) — the
  platform does, as a warning fact (*Git file vs device configuration*), never a gate. Since network-provisioning 1.27.0, when that
  fact lists Git-file lines the device does not have, the package applies that device incrementally (only the changed lines, in a
  session) instead of loading the whole file; some listed lines are rendering differences. A Git-only device gets no device-service call. Pasted device state is treated as evidence,
  never as the starting file. A pipeline that only derives a value for others (a value leg) changes no configuration. It
  needs no block, and with none it reads through its service descriptor and reads no Git file. Since network-derivation 1.3.0
  (2026-11-06) it MAY declare its own block (in a program: its own `## Device sources` section, carried as
  `deviceSources["network-derivation"]`) to derive from your Git files: allowed and stated, never blocked — its card reads
  `liveEvidence: git-only (declared devices)` ([PIPELINES.md](PIPELINES.md), "Which devices to list").
- **Branches:** the Git file source reads `main`, or the one ref its descriptor's `gitPin.ref` declares. A read that names no
  branch is read as `main` (since 2026-11-04) — never the repository's default branch — so a repo whose default is `master` must
  still have a `main` branch, and a service that pins `release` refuses a read naming no branch. A branch, tag or commit the service
  does not declare is refused and the leg stops.
- **Paths never read through any file read (since 2026-11-04):** Terraform state, plan, variables and CLI-credential files and a
  Nornir inventory are refused at the call gate on EVERY `get_file_contents` call, pinned or not — including your own GitHub MCP
  service used in chat (`NEVER_READ_PATH`, logged as a blocked call). Name `.tf` and device configuration files only.
  *Network legs (since network-provisioning 1.24.0/1.25.0):* a refused ref does not stop the leg — that device is HELD (listed first,
  nothing packaged) and the leg's outcome is needs-revision (platform-forced if needed; since 1.27.0 the change Reviewer also refuses it,
  naming the device); on an unpinned customer Git service the ref in the declared line is read as named.

## 4. Self-host operator settings (all off by default)

| Setting | Effect |
|---|---|
| `HUB_PRIVATE_ENDPOINT_ALLOWLIST` | private hosts (service endpoints and descriptor URLs) the hub may reach; the hard-denied ranges stay denied |
| `DESCRIPTOR_FETCH_ALLOW_HTTP=true` | allow plain-http descriptor URLs |
| `HELD_ELIGIBILITY_INSTALL_WIDE=true` | every user of the install holds like the owner |

## 5. Known limits

- Git servers other than GitHub (GitLab, Bitbucket Server, Azure DevOps) are not yet a kept-file source. GitHub Enterprise Server is expected to work.
- A descriptor cannot be refreshed in place: delete the service and register it again.
- Program requirements are published at public URLs today; private specs are not supported yet.
- Kept files on a self-hosted install: see [SELF-HOST-KEPT-FILES.md](SELF-HOST-KEPT-FILES.md).
