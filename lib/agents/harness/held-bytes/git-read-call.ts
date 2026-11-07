/**
 * held-k8s step 2 (SYNTHESIS v3 §2 "Step 2", PC S4 + §6.2 gap 9): the ONE agent-facing call shape for a config-repo FILE read.
 *
 * WHY ONE CONSTANT. Capture keys on the descriptor table (`descriptors.ts`, service + tool). Protocol text that named one service
 * while capture keyed on another would produce SILENT ZERO captures — the D-C "non-default service name" class, which reads as
 * `no-files`. So the text interpolates this constant, the constant is built from the descriptor table's own service name, and
 * `test-domain-carry-pins` pins (a) that a descriptor entry with exactly this service + tool exists and (b) that the k8s protocol
 * carries the constant verbatim. A later domain (terraform) reuses it.
 *
 * SHAPE (owner G-7, K-5 refined; the 1c pin in git-file-source-pin.js): `owner`, `repo`, `path` and an optional `ref: 'main'` — the
 * default branch only, NEVER `sha`. `path` is always passed: an omitted path lists the repo root, and a listing is not a file.
 * The placeholders are generic on purpose — never the lab repo's name (domain protocols stay rig-independent, PC N4).
 */
import { GITHUB_FILE_SOURCE } from './descriptors';

/** The descriptor table's tool for a Git file read (closed world: the server runs `--tools get_file_contents`). */
export const GIT_FILE_READ_TOOL = 'get_file_contents';

/** The call as agent text, inline-code-quoted, ready to interpolate into a protocol body. */
export const GIT_FILE_READ_CALL =
  `\`services(action:'call', targetService:'${GITHUB_FILE_SOURCE}', tool:'${GIT_FILE_READ_TOOL}', ` +
  `arguments:{ owner:'<owner>', repo:'<repo>', path:'<path>', ref:'main' })\``;

/**
 * Config-sources (DESIGN v2 §8.2; prompt-construction B4/S6): the DECLARED-source call — the same tool, with two slots a declared
 * line fills: the Git service THE LINE NAMES (never an implicit platform default — PIN-DEFAULT-NEVER-PUBLIC) and the ref the line
 * names, or `main` (push 0: an absent ref is read as `main`, so the text always passes one). Adopted per domain at that domain's
 * Config-sources step: network-provisioning 1.26.0 first; kubernetes-gitops and terraform-iac keep `GIT_FILE_READ_CALL` until their
 * own steps, and the old constant is deleted with terraform's. Interim pins (`test-domain-carry-pins` CS-GIT-CALL): each protocol
 * interpolates exactly one of the two; both name `GIT_FILE_READ_TOOL`; no protocol names `targetService:'github-service'` in a Git
 * read outside the old constant. Capture keys on the declared line, so a service the text names that the capture does not hold is a
 * named force (`git-file-not-held`), never a silent zero.
 */
export const GIT_FILE_READ_CALL_DECLARED =
  `\`services(action:'call', targetService:'<the Git service the line names>', tool:'${GIT_FILE_READ_TOOL}', ` +
  `arguments:{ owner:'<owner>', repo:'<repo>', path:'<path>', ref:'<the ref the line names, or main>' })\``;
