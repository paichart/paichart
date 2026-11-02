# Customer internal setup guide (INTERNAL draft — not public)

> Status: **internal only** (Steve, 2026-10-24). Publish only when the PH-7 public-push hold lifts (the self-host held text
> exists). Source of each fact: `cline_docs/reviews/held-network-2026-10-22/INTERNAL-FIT-INVENTORY.md` (IF-1…IF-5),
> `IF3-SHARED-ELIGIBILITY-DESIGN.md`, `WI-B10-DESIGN.md`, `STEP2-TEXT-DRAFT.md`. Keep every example service-, vendor- and
> device-agnostic.

Most deployments are internal: one person registers the team's device, Git and cloud services, and many engineers run
pipelines against them. This guide says what that setup needs. **Applying a change is always yours**; the pipelines are
read-only and produce a change package (G2). **Your services' security is your responsibility** (G1).

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
  pin — only a read equal to that line (owner/repo/path, its ref or the default branch) is kept; the declaration is snapshotted
  when the leg first runs, so the run cannot rewrite it.
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
  - `<device>: command-package`

  A device with no line stops the leg. A device may have both a `git-file` and a `device-read` line: the Git file is the
  base and the device read is quoted as evidence only; the agents do not compare them (`drift: not checked`) — since held-network step 3 the
  platform does, as a warning fact (*Git file vs device configuration*), never a gate. Pasted device state is treated as evidence,
  never as the starting file. A pipeline that only derives a value for others (a value leg) changes no configuration and
  needs no block.
- **Branches:** the Git file source reads the repository's default branch, or the one ref its descriptor's `gitPin.ref`
  declares. A branch, tag or commit the service does not declare is refused and the leg stops.
  *Network legs (since network-provisioning 1.24.0/1.25.0):* a refused ref does not stop the leg — that device is HELD (listed first,
  nothing packaged) and the leg's outcome is needs-revision (platform-forced if needed); on an unpinned customer Git service the ref
  in the declared line is read as named.

## 4. Self-host operator settings (all off by default)

| Setting | Effect |
|---|---|
| `HUB_PRIVATE_ENDPOINT_ALLOWLIST` | private hosts (service endpoints and descriptor URLs) the hub may reach; the hard-denied ranges stay denied |
| `DESCRIPTOR_FETCH_ALLOW_HTTP=true` | allow plain-http descriptor URLs |
| `HELD_ELIGIBILITY_INSTALL_WIDE=true` | every user of the install holds like the owner |

## 5. Known limits (filed, with triggers)

- Git servers other than GitHub (GitLab, Bitbucket Server, Azure DevOps) are not yet a held file source (register
  NON-GITHUB-GIT-SOURCE). GitHub Enterprise Server is expected to work.
- No descriptor refresh (DESCRIPTOR-REFRESH).
- Program requirements are published at public URLs today; private specs are in progress (INTERNAL-FIT I-19).
- ~~A self-hosted install does not yet receive the held-edit capability (PH-7).~~ PH-7 landed 2026-11-01: the self-host kept-files text is `docs/SELF-HOST-KEPT-FILES.md`; the held protocols export with it.
