/**
 * Service-registration uniqueness — ONE place for the "name taken" / "endpoint taken" errors (REGISTRATION-UNIQUENESS-TOCTOU,
 * 2026-10-14; follow-up cline_docs/follow-ups/registration-uniqueness-toctou-2026-09-22.md).
 *
 * The handlers keep their read-before-write checks as the FAST PATH that produces a good message. The database now
 * makes the claim true (unique indexes mcp_tools_name_key and mcp_tools_endpoint_key, scripts/create-mcp-tools-unique-
 * indexes.sh). A registration that loses the race between the read and the write gets Prisma P2002; this module maps it
 * to the SAME client-facing error the read would have produced, so the contract is unchanged.
 *
 * P2002 `meta.target` shapes, measured on a real race (2026-10-14, Prisma 6.19.3, PostgreSQL):
 *   name index     → ["name"]
 *   endpoint index → ["(configuration ->> 'endpoint'::text)"]
 */
'use strict';

const { validationError } = require('./error-helpers');
const { sanitizeEndpointUrl } = require('./hub-shared-middleware');

/**
 * Every error this module builds carries this marker so an outer catch that re-wraps errors (service-update-handler's
 * enhancedOperationError — it re-escapes, flattens and cuts at ~200 chars, boundary review U1) can pass it through intact.
 */
function mark(err) {
  Object.defineProperty(err, 'isRegistryUniquenessError', { value: true });
  return err;
}

/** The error a registration gets when its name is already taken (text unchanged from the original inline check). */
function nameTakenError(validatedArgs) {
  return mark(validationError(
    [`Service name '${validatedArgs.name}' is already registered`],
    {
      name: 'my-unique-service-name',
      endpoint: validatedArgs.endpoint,
      category: validatedArgs.category,
      description: validatedArgs.description
    },
    "Choose a unique service name. Use registry(action: 'list') to see your existing services."
  ));
}

/**
 * The error when an endpoint is already registered. For REGISTER the text is unchanged from the original inline check.
 * For UPDATE (new in 2026-10-14 — update never refused before, so this SETS a contract) the first sentence is identical
 * and the example is update-shaped: register's example names fields `update` rejects (boundary review U1).
 */
function endpointTakenError(endpoint, ownerName, { forUpdate = false } = {}) {
  const example = forUpdate
    ? { service_name: 'my-api', updates: { endpoint: 'https://api.my-other-endpoint.com/mcp' } }
    : { name: 'my-new-service', endpoint: 'https://api.mynewservice.com/mcp', category: 'data-services', description: 'My service description' };
  return mark(validationError(
    [`Endpoint '${endpoint}' is already registered by service '${ownerName}'`],
    example,
    'Each service must have a unique endpoint. Use a different endpoint or call the existing service.'
  ));
}

/** A P2002 on mcp_tools that neither the target nor a re-read could attribute: a clean message, never Prisma's text. */
function ambiguousTakenError() {
  return mark(validationError(
    ['Service name or endpoint is already registered'],
    { name: 'my-unique-service-name', endpoint: 'https://api.mynewservice.com/mcp' },
    "Choose a unique service name and endpoint. Use registry(action: 'list') to see your existing services."
  ));
}

/**
 * Which uniqueness rule a Prisma error violated: 'name' | 'endpoint' | null (not a uniqueness violation of these two).
 * Keyed on P2002 + meta.target; anything else is not ours to translate.
 */
function uniqueViolationField(err) {
  if (!err || err.code !== 'P2002') return null;
  const target = err.meta && err.meta.target;
  const parts = Array.isArray(target) ? target.map(String) : (typeof target === 'string' ? [target] : []);
  if (parts.some((t) => t === 'name' || t === 'mcp_tools_name_key')) return 'name';
  if (parts.some((t) => t.includes('endpoint'))) return 'endpoint';
  // Third documented shape (database-management-discovery §4b): no usable target, the index name only in the message.
  if (parts.length === 0 && typeof err.message === 'string') {
    if (err.message.includes('mcp_tools_name_key')) return 'name';
    if (err.message.includes('mcp_tools_endpoint_key')) return 'endpoint';
  }
  return null;
}

/** Owner of an endpoint, for the message. Null when the winning row is already gone (delete in between). */
async function endpointOwnerName(prisma, endpoint, excludeId) {
  const row = await prisma.mCPTool.findFirst({
    where: {
      configuration: { path: ['endpoint'], equals: endpoint },
      ...(excludeId ? { NOT: { id: excludeId } } : {})
    },
    select: { name: true }
  });
  return row ? row.name : null;
}

/**
 * Translate a lost uniqueness race into the client-facing error; rethrow anything else unchanged.
 * `log` gets one warn line naming the field, so a race that fires is visible (it should be rare).
 */
async function rethrowUniqueViolation(err, { prisma, endpoint, validatedArgs, excludeId, log, op }) {
  let field = uniqueViolationField(err);
  // P2002 whose shape we do not recognise (a Prisma upgrade can change meta.target — boundary review P1): decide by
  // RE-READING the table rather than passing Prisma's raw message (server paths, source frames) to the client.
  if (!field && err && err.code === 'P2002' && (!err.meta || !err.meta.modelName || err.meta.modelName === 'MCPTool')) {
    const nameRow = validatedArgs && validatedArgs.name && op === 'register'
      ? await prisma.mCPTool.findFirst({ where: { name: validatedArgs.name }, select: { id: true } })
      : null;
    if (nameRow) field = 'name';
    else if (endpoint && (await endpointOwnerName(prisma, endpoint, excludeId))) field = 'endpoint';
    else {
      if (log) log.warn({ op, field: 'unattributed', target: err.meta && err.meta.target }, 'registration uniqueness: P2002 not attributable to name or endpoint');
      throw ambiguousTakenError();
    }
  }
  if (!field) throw err;
  // Endpoint sanitised before logging: an endpoint can carry a credential in its query (architectural review S1).
  if (log) log.warn({ op, field, serviceName: validatedArgs && validatedArgs.name, endpoint: sanitizeEndpointUrl(endpoint) }, 'registration uniqueness: write refused by the database (lost a race the read check could not see)');
  if (field === 'name') throw nameTakenError(validatedArgs);
  const owner = await endpointOwnerName(prisma, endpoint, excludeId);
  throw endpointTakenError(endpoint, owner || 'another service', { forUpdate: op === 'update' });
}

module.exports = { nameTakenError, endpointTakenError, ambiguousTakenError, uniqueViolationField, endpointOwnerName, rethrowUniqueViolation };
