# Connecting network devices: what pAIchart reads, and what your service must offer

**For:** a network or security team deciding whether to connect switches, routers or firewalls, and the engineer who runs the
read-only device service.

pAIchart helps you make a change to a network device's configuration: for example, adding a loopback and advertising it,
changing a routing policy, or opening a path through a firewall. It reads the configuration, works out the change, has it
reviewed, and gives you the exact edits with the commands that check them and a rollback. **It never applies anything, and it
never opens a configuration session on a device.** Your engineers apply the change, in your own change window.

This page explains what it reads, what it never does, how you say where each device's configuration comes from, and what the
comparison between your Git file and the device tells you. The `## Device sources` block it describes applies from
network-provisioning 1.23.0; `live-read` from 1.26.0.

## How pAIchart reaches your devices

Most teams do not connect a device at all. If your device configurations are in Git, pAIchart can work from those files alone
(see "Git only" below).

When you do want the running configuration read, pAIchart does not log in to your devices and stores no device credentials. It
talks to a small **read-only service that you run**, in your own network, which holds the device credential and the inventory.
The service offers read tools and nothing else.

So there are two limits, and you own both:

- **The account the service uses on the devices:** the hard boundary. Give it a read-only role on the device, and the device
  itself refuses a configuration command, whoever sends it.
- **The service's own tool list:** a second layer. Our reference service has no tool that can change a device, so a write does
  not exist to be called.

Our reference service, its lab and its descriptor are in the public repository: `usecases/network-lab/` (the service is
`nornir-mcp-docker/`) and `descriptors/ceos-lab-readonly-descriptor.json`. It is pAIchart's own small server on the open-source
`nornir` and `napalm` libraries, with only the three read tools. Your team can read exactly what each tool does.

## What it reads

| Tool | What it returns | Used for |
|---|---|---|
| `list_devices` | the service's inventory: device names, groups, platforms | finding the device names before anything else is read |
| `fetch_data` | structured, read-only device state through NAPALM getters: the running configuration, facts, interfaces and their addresses, BGP neighbours and configuration, LLDP neighbours, and similar | the running configuration a change is based on or checked against, and the state around it |
| `show_commands` | the text output of read-only `show` commands from a list the descriptor names (route tables, OSPF and IS-IS neighbours, the IS-IS database) | state the structured getters cannot return |

A leg reads only the devices your spec declares (next section). It does not sweep the inventory.

## What it never does

- **It never configures a device.** No tool on the reference service can apply, commit, load, replace or save a configuration,
  or reload a device. Such tools are not refused at run time: they are not in the code.
- **It never opens a configuration session**, not even to check a candidate and abort. Checks that need one are written into
  the package for your engineers to run.
- **It never keeps a device credential.** The credential stays in your service.
- **It never keeps a configuration it did not read itself.** A configuration pasted into a task is treated as information, never
  as the base for a change.

Two things to know, stated plainly:

- **The `show` command list is enforced by the service.** The reference service runs only the nine `show` commands its
  descriptor lists and refuses any other before contacting a device (`command_not_allowed`). The hub does not check the list
  itself, so a service you run yourself must enforce its own. Anyone who can reach the service's port directly can still read
  what those nine commands and the getters show, so keep the port private to your hub, and make the device account read-only.
- **The reference service signs in to devices with one static service credential**, not with the identity of the person who
  started the run. It is a lab service. For production, run your own service with the credential handling your policy requires.

**Secrets in a configuration.** A running configuration carries password hashes, SNMP communities and keys. pAIchart's redactor
replaces them with a placeholder in everything a run stores, so a kept configuration is shown with its secrets masked. See
[SECURITY.md](SECURITY.md), "The two output guards", and [SELF-HOST-KEPT-FILES.md](SELF-HOST-KEPT-FILES.md).

## What you tell pAIchart: the `## Device sources` block

Your spec says, one line per device, where that device's configuration comes from:

```
## Device sources
switch-a: git-file — service github-service ; your-org/your-configs/network/switch-a.cfg
switch-b: git-file — service github-service ; your-org/your-configs/network/switch-b.cfg
switch-b: device-read — service <your device service's name, or its descriptor URL>
edge-fw:  live-read — service <your device service's name, or its descriptor URL>
```

| Line kind | What pAIchart does | Use it for |
|---|---|---|
| `git-file` | reads the file from your Git repository and **keeps** it; the change is written as edits to that kept copy | a device whose configuration of record is in Git (most teams, most devices) |
| `device-read` | reads the whole running configuration from the device and **keeps** it; the change is written as edits to that copy | a device with no file in Git |
| `git-file` and `device-read` together | the Git file is the base; the device read is evidence, and the platform compares the two (below) | a device you want checked against what is actually running |
| `live-read` | reads the running configuration as **evidence only**: never kept, never edited. It must be that device's only line | a device the change must see and does not touch |
| `command-package` | reads nothing; the change is written as commands | a device with no file and no readable configuration |

**List every device the leg must see, not only the ones it changes.** If the change picks a value that must not clash with
another device (an address, a pool, an AS number), that device needs a line too. A device you leave out is not read, and the
leg's reviewer may approve a value that clashes with it. This is a known limitation; the fix is to list the device. Details:
[PIPELINES.md](PIPELINES.md), "Which devices to list".

### Git only

A device with a `git-file` line and no device line is never contacted: no call is made to any device service for it. Everything
the leg knows about it comes from your file. That is allowed and is the expected setup for most teams. Its one limit is stated
on the run, never hidden: something configured on the device by hand and never committed to Git cannot be seen.

## Git file against the device: what the comparison tells you

When a device has both a `git-file` and a `device-read` line, **pAIchart's own code** compares the two copies. The agents do not:
they are told not to compare, and the reviewer reads the platform's result.

The result is a fact called *Git file vs device configuration*. It lists lines of your Git file that the device does not have
under the same block.

- **It is a warning, never a block.** A difference does not stop the run.
- **Some listed lines are rendering differences**, not real ones: a device prints its configuration in its own order and style,
  and a default may be shown or left out. pAIchart does not guess which is which, and names no cause.
- **It changes how the package tells you to apply.** Since network-provisioning 1.27.0, when the fact lists any line for a
  device, the package applies that device **incrementally** (only the changed lines, in a configuration session), or first
  brings the Git file in line with the device; never a whole-file load. Loading the whole Git file onto a device that differs
  from it could remove something the device needs, and the change reviewer refuses a package that does.

## What you get back

A change package for each leg:

- **the edits**, written against the kept copy of each file, with the result shown as a diff;
- **an apply note** per device: whole file or incremental, and why;
- **the validation commands** to run before and after, with what each should show;
- **a rollback** per device.

Your engineers apply it. Nothing in the package has been applied when you receive it. A run that cannot produce a safe change
stops and says why instead of producing one.

## If you run your own device service

Any read-only MCP service can serve `live-read` and evidence reads. For a `device-read` line, where the configuration is
**kept** as the base for edits, pAIchart must recognise the read. It keeps a configuration when:

- the leg's block declares `device-read` for that device and that service, and
- the call is a `fetch_data` call whose structured result carries the running configuration at
  `hosts.<device name>.output.config.running` (the reference service's shape; other getters may be in the same call).

The text output of a `show running-config` command is never kept: it is a rendering of a command, not the configuration the
getter returns.

Register the service once in your hub and name it in the block, or publish a descriptor and put its URL in the block (the
service is then registered for the run and removed at the end). Which to choose: [CONNECTING-YOUR-SERVICES.md](CONNECTING-YOUR-SERVICES.md).
The descriptor format, its schema and five examples are in the public repository under `descriptors/`.

Check your service the way you should check any of these, by listing what it offers:

```bash
curl -s -X POST http://127.0.0.1:3107/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

The reference service answers with exactly `list_devices`, `fetch_data` and `show_commands`.

## In short

- **Read-only**, through a service you run, with a device account you create. pAIchart stores no device credentials.
- **Often no device connection at all:** most teams declare Git files only, and no device is contacted.
- **Scoped by you:** the device account sets the hard limit, and your `## Device sources` block sets which devices are read.
- **Never:** a configuration change, a configuration session, a reload, or a kept copy of something you pasted.
- **The Git-against-device comparison is pAIchart's own code.** It warns, names no cause, and makes the package apply that
  device incrementally, never as a whole-file load.
- **You stay in control of the change:** pAIchart hands you reviewed edits, the checks and a rollback, and your engineers apply
  them.

A guided tour of one network leg, step by step: [walkthroughs/NETWORK-LEG-WALKTHROUGH.md](walkthroughs/NETWORK-LEG-WALKTHROUGH.md).
