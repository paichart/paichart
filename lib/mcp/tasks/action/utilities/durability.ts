import { mcpLogger } from '@/lib/logger';

/**
 * Post-commit durability assertion — shared by the MCP create handlers.
 *
 * Guards the phantom-commit class found 2026-06-19 (a resolved create transaction
 * with no durable row, so the caller reported a phantom success). Call AFTER the
 * create transaction resolves; readBack re-reads the row by id on a fresh,
 * committed-state query. If it returns null, this logs "Durability assertion
 * FAILED" (the prod-alert anchor) and throws, rather than letting the caller
 * report success (Protocol 10: ship the fact of persistence).
 *
 * readBack must be a plain row read — never re-run the write here.
 * See cline_docs/findings/2026-06-20-mcp-task-create-false-success.md.
 */
export async function assertPersisted(
  readBack: () => Promise<{ id: string } | null>,
  opts: {
    entity: 'Task' | 'POV' | 'Stage' | 'AgentExecution';
    actionLabel: string;
    id: string;
    log: Record<string, unknown>;
  }
): Promise<void> {
  const row = await readBack();
  if (row) return;

  mcpLogger.error(
    opts.log,
    `Durability assertion FAILED: ${opts.actionLabel} transaction resolved but the row is absent on read-back — phantom commit suspected`
  );
  throw new Error(
    `${opts.entity} creation did not persist (id ${opts.id} not found after commit). The write was not durable — ` +
    `please retry. This is a server-side data-integrity guard, not a validation error.`
  );
}
