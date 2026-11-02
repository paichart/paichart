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
