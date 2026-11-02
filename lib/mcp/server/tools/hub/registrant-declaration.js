/**
 * WI-B10 (2026-10-23) — the registration side of registrant file declarations. ONE module so the handler stays a thin
 * caller, and the ONLY writer of the mcp_tools declaration columns and of held_declarations (design §9.1 D; grep-pinned).
 *
 *   - aliasCollision(rawArgs): mcp-hub B-2 — the normalizer camelCases keys (last write wins), so `held_files` /
 *     `descriptor_url` could launder past the boundary or overwrite a validated spelling. >1 raw key per target ⇒ refused.
 *   - agentDeclarationRefusal(args, context, transport): C-4 / mcp-hub S1 / sec-ops SF-3 — a direct `heldFiles` argument is
 *     refused when the call carries `callingExecutionId` OR arrives through the embedded agent tool server.
 *   - resolveFromDescriptor(args, deps): NS-1 (a) + WB-2 — fetch the descriptor, project it onto the register fields (never a
 *     spread), refuse a caller-typed SECURITY field that disagrees, re-parse with the boundary schema.
 *   - buildDeclaration(heldFiles, ctx): the ONE validator (held-file-declaration.js) + platform reservations (F).
 *   - writeDeclarationSnapshot / declarationColumns: the single writer.
 *
 * Design: cline_docs/reviews/held-network-2026-10-22/WI-B10-DESIGN.md §9.1 A/B/D/F, §10.
 */
'use strict';

const { validateHeldFiles, GRAMMAR_VERSION } = require('../../config/held-file-declaration');
const { fetchDescriptor } = require('../../config/descriptor-fetch');
const { GIT_FILE_SOURCE_PINS } = require('../../config/git-file-source-pin');

/** The platform-default service names and file targets a registrant may never declare (F). Pinned EQUAL to
 *  PLATFORM_DEFAULT_DESCRIPTORS (held-bytes/descriptors.ts) by test-registrant-declaration — a static copy because this
 *  file must load under bare Node (no TS import). */
const PLATFORM_DECLARATION_SERVICE_NAMES = Object.freeze(['observability-readonly', 'github-service']);
const { PLATFORM_DECLARATION_TARGETS } = require('../../config/held-file-declaration'); // sec-ops build SF-2: ONE list (capture re-checks it)

const SECURITY_FIELDS = ['name', 'endpoint', 'authType'];
const FILLABLE_FIELDS = ['description', 'category', 'version'];
const camel = (k) => String(k).replace(/[-_]+([a-z0-9])/gi, (_, c) => c.toUpperCase());

function aliasCollision(rawArgs) {
  if (!rawArgs || typeof rawArgs !== 'object') return null;
  for (const target of ['heldFiles', 'descriptorUrl']) {
    const keys = Object.keys(rawArgs).filter((k) => camel(k) === target);
    if (keys.length > 1) return target;
  }
  return null;
}

/**
 * THE one "is this call from an agent run?" predicate (sec-ops SF-3 + INTERNAL-FIT I-7 condition 1): the embedded agent tool
 * server, or a server-set callingExecutionId. Every agent-vs-human rule on registration reads THIS — never a second copy.
 */
function isAgentCaller(context, transport) {
  if (transport === 'embedded') return true;
  return !!(context && typeof context === 'object' && context.callingExecutionId);
}

function agentDeclarationRefusal(args, context, transport) {
  if (!args || args.heldFiles === undefined) return false;
  return isAgentCaller(context, transport);
}

/** Tool NAMES of a capabilities value (strings or { name } objects). */
function toolNamesOf(capabilities) {
  const tools = capabilities && typeof capabilities === 'object' && Array.isArray(capabilities.tools) ? capabilities.tools : [];
  return tools.map((t) => (typeof t === 'string' ? t : t && typeof t === 'object' ? t.name : null)).filter((n) => typeof n === 'string');
}

function platformPins() {
  return Object.values(GIT_FILE_SOURCE_PINS || {}).map((p) => ({ owner: p.owner, repo: p.repo }));
}

function buildDeclaration(heldFiles, { serviceName, capabilities }) {
  return validateHeldFiles(heldFiles, {
    serviceName,
    capabilityToolNames: toolNamesOf(capabilities),
    platformServiceNames: [...PLATFORM_DECLARATION_SERVICE_NAMES, ...Object.keys(GIT_FILE_SOURCE_PINS || {})],
    platformPins: platformPins(),
    platformTargets: PLATFORM_DECLARATION_TARGETS,
  });
}

/**
 * NS-1 (a) + WB-2. deps: { registerFieldsSchema, fetch?: fetchDescriptor }.
 * Returns { ok: true, validatedArgs, heldFiles (raw, may be undefined), provenance: { url, rawSha256, fetchedAt } }
 *      | { ok: false, code, message }   — `code` is the named refusal; `message` carries no fetched content.
 */
async function resolveFromDescriptor(args, deps) {
  const fetch = deps.fetch || fetchDescriptor;
  // INTERNAL-FIT I-7 (sec-ops option b): a query string only on a HUMAN registration (deps.allowQuery, from isAgentCaller).
  const r = await fetch(args.descriptorUrl, { allowQuery: deps.allowQuery === true });
  if (!r.ok && r.reason === 'descriptor-query') {
    // condition 4: never echo the URL; say who CAN register it.
    return { ok: false, code: r.reason, message: 'descriptor-query: a descriptor URL with a query string must be registered by an operator (a pre-registered service); an agent run cannot pass one' };
  }
  if (!r.ok) return { ok: false, code: r.reason, message: `${r.reason}: the descriptor at descriptorUrl could not be used${r.preConnect ? '' : ' (fetch failed)'}` };
  const d = r.json;
  // Project onto exactly the register fields + heldFiles — never spread the parsed object (it may carry `_comment` and
  // arbitrary keys; additionalProperties is true in the public schema).
  const projection = {};
  for (const k of [...SECURITY_FIELDS, ...FILLABLE_FIELDS, 'capabilities']) if (Object.prototype.hasOwnProperty.call(d, k)) projection[k] = d[k];
  // A caller-typed SECURITY field must equal the descriptor's (WB-2); capabilities compare as the SET of tool names.
  for (const k of SECURITY_FIELDS) {
    if (args[k] !== undefined && projection[k] !== undefined && String(args[k]) !== String(projection[k])) {
      return { ok: false, code: 'DESCRIPTOR_FIELD_DISAGREES', message: `DESCRIPTOR_FIELD_DISAGREES: ${k} differs from the fetched descriptor — pass only descriptorUrl` };
    }
  }
  if (args.capabilities !== undefined && projection.capabilities !== undefined) {
    const a = new Set(toolNamesOf(args.capabilities)); const b = new Set(toolNamesOf(projection.capabilities));
    if (a.size !== b.size || [...a].some((x) => !b.has(x))) {
      return { ok: false, code: 'DESCRIPTOR_FIELD_DISAGREES', message: 'DESCRIPTOR_FIELD_DISAGREES: capabilities differ from the fetched descriptor — pass only descriptorUrl' };
    }
  }
  // Non-security fields: the descriptor wins; the caller may fill one only when the descriptor omits it.
  for (const k of FILLABLE_FIELDS) if (projection[k] === undefined && args[k] !== undefined) projection[k] = args[k];
  for (const k of ['name', 'endpoint', 'description', 'category']) {
    if (projection[k] === undefined) return { ok: false, code: 'DESCRIPTOR_MISSING_FIELD', message: `DESCRIPTOR_MISSING_FIELD: the descriptor carries no ${k}` };
  }
  if (projection.authType === undefined) projection.authType = args.authType || 'NONE';
  const parsed = deps.registerFieldsSchema.safeParse(projection);
  if (!parsed.success) {
    const i = parsed.error.issues[0] || {};
    return { ok: false, code: 'DESCRIPTOR_INVALID', message: `DESCRIPTOR_INVALID: ${(i.path || []).join('.') || '(root)'}: ${i.message || 'invalid'}` };
  }
  return { ok: true, validatedArgs: parsed.data, heldFiles: d.heldFiles, provenance: { url: r.storedUrl || r.url, rawSha256: r.sha256, fetchedAt: new Date() } };
}

/** Insert the immutable snapshot ON CONFLICT DO NOTHING, BEFORE the mcp_tools write (an orphan snapshot is harmless). */
async function writeDeclarationSnapshot(prisma, sha256, declaration) {
  await prisma.heldDeclaration.createMany({ data: [{ sha256, heldFiles: declaration, grammarVersion: GRAMMAR_VERSION }], skipDuplicates: true });
}

/** The mcp_tools columns for a create: the declaration (when there is one) and the descriptor provenance (whenever the row
 *  was registered from a descriptor URL — adoption and the field lock key on descriptorSha256, with or without heldFiles). */
function declarationColumns({ decl, provenance } = {}) {
  return {
    ...(decl ? { heldFiles: decl.declaration, heldFilesSha256: decl.sha256, declarationSource: decl.source } : {}),
    ...(provenance ? { descriptorUrl: provenance.url, descriptorSha256: provenance.rawSha256, descriptorFetchedAt: provenance.fetchedAt } : {}),
  };
}

/** Same-owner, same-raw-descriptor adoption (mcp-hub SF-5 as restated by audit A-2): descriptor-URL rows only. */
function adoptable(existing, { userId, rawSha256 }) {
  if (!existing || !rawSha256 || typeof existing.descriptorSha256 !== 'string') return false;
  const ownerId = existing.configuration && typeof existing.configuration === 'object' ? existing.configuration.ownerId : null;
  return ownerId === userId && existing.descriptorSha256 === rawSha256;
}

/** The declared tools a capabilities change would orphan (a `direct` declaration re-check — mcp-hub B-4). */
function orphanedDeclarationTools(row, newCapabilities) {
  const files = row && row.heldFiles && typeof row.heldFiles === 'object' && Array.isArray(row.heldFiles.files) ? row.heldFiles.files : [];
  const tools = new Set(toolNamesOf(newCapabilities));
  return [...new Set(files.map((f) => f && f.tool).filter((t) => typeof t === 'string' && !tools.has(t)))];
}

/** True when a row was registered from a descriptor URL — its WB-2 fields are then descriptor-owned (C / A-11f). */
function isDescriptorOwned(row) {
  return !!row && typeof row.descriptorSha256 === 'string' && row.descriptorSha256.length > 0;
}

module.exports = {
  isAgentCaller,
  PLATFORM_DECLARATION_SERVICE_NAMES,
  PLATFORM_DECLARATION_TARGETS,
  aliasCollision,
  agentDeclarationRefusal,
  toolNamesOf,
  buildDeclaration,
  resolveFromDescriptor,
  writeDeclarationSnapshot,
  declarationColumns,
  adoptable,
  isDescriptorOwned,
  orphanedDeclarationTools,
};
