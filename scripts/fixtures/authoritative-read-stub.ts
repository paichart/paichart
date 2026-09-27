/**
 * Test double for the authoritative-read surface (RWF Wave B). These are the three Prisma calls
 * `readAuthoritativeResultField` makes:
 *   - agentExecution.findMany (via selectAuthoritativeExecution);
 *   - agentArtifact.findFirst (its R8 floor);
 *   - one executionId-keyed `$queryRaw`.
 *
 * It THROWS on anything it does not model, on purpose. A stub that returned [] for an unexpected call
 * would push every net arm to `no-author-text` and still look like a test (execution-facts review B-4).
 * In particular, a `$queryRaw` keyed on the artifact CONTENT's taskId (the pre-Wave-B read) throws. So
 * every suite built on this stub is also a regression pin against that read coming back.
 *
 * No DB, no app imports.
 */

export interface StubExecution {
  id: string;
  taskId: string;
  status?: 'SUCCESS' | 'FAILED';
  supersededById?: string | null;
  /** The ordering key, and the selector's only sanctioned one. Later = newer. */
  createdAt: Date;
  /** The result.json object (serialized for agentArtifact.findFirst). null ⇒ no artifact. */
  result: Record<string, unknown> | null;
  /** The jsonb `->>'rollbackContainment'` rendering, for tests that need production's exact key order. */
  rollbackContainmentJsonbText?: string | null;
  /** The execution's context (RWF C.1 record lives here). Default {}. */
  context?: Record<string, unknown>;
}

export function authoritativeReadStub(executions: StubExecution[], opts: { deps?: Record<string, string[]> } = {}) {
  const byId = new Map(executions.map((e) => [e.id, e]));
  return {
    // RWF C.3: the freshness comparison's createdAt fallback reads a task's dependency edges.
    taskDependency: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const w = args?.where ?? {};
        if (Object.keys(w).join(',') !== 'taskId') throw new Error(`authoritativeReadStub: unmodelled taskDependency.findMany where ${JSON.stringify(w)}`);
        return (opts.deps?.[String(w.taskId)] ?? []).map((dependsOnId) => ({ dependsOnId }));
      },
    },
    agentExecution: {
      // RWF C.3: the freshness comparison reads the reviewer execution's own row (context holds the record).
      findUnique: async (args: { where?: Record<string, unknown> }) => {
        const w = args?.where ?? {};
        if (Object.keys(w).join(',') !== 'id') throw new Error(`authoritativeReadStub: unmodelled agentExecution.findUnique where ${JSON.stringify(w)}`);
        const e = byId.get(String(w.id));
        return e ? { taskId: e.taskId, createdAt: e.createdAt, context: e.context ?? {}, config: {} } : null;
      },
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const w = args?.where ?? {};
        const keys = Object.keys(w).sort().join(',');
        if (keys !== 'status,supersededById,taskId' || w.status !== 'SUCCESS' || w.supersededById !== null) {
          throw new Error(`authoritativeReadStub: unmodelled agentExecution.findMany where ${JSON.stringify(w)}`);
        }
        return executions
          .filter((e) => e.taskId === w.taskId && (e.status ?? 'SUCCESS') === 'SUCCESS' && (e.supersededById ?? null) === null)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
          .slice(0, 10)
          .map((e) => ({ id: e.id, status: 'SUCCESS', createdAt: e.createdAt, supersededById: null }));
      },
    },
    agentArtifact: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const w = args?.where ?? {};
        if (typeof w.executionId !== 'string' || Object.keys(w).some((k) => k !== 'executionId' && k !== 'name')) {
          throw new Error(`authoritativeReadStub: unmodelled agentArtifact.findFirst where ${JSON.stringify(w)}`);
        }
        const e = byId.get(w.executionId);
        return e?.result ? { content: JSON.stringify(e.result) } : null;
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (/->>\s*'taskId'/.test(sql)) {
        throw new Error('authoritativeReadStub: a result.json read keyed on content taskId — the pre-Wave-B read is back');
      }
      if (!/"executionId"\s*=\s*\?/.test(sql)) {
        throw new Error(`authoritativeReadStub: unmodelled $queryRaw — ${sql.slice(0, 90)}`);
      }
      const e = byId.get(String(values[0]));
      if (!e?.result) return [];
      if (sql.includes("->>'finalResponse'")) {
        const fr = e.result.finalResponse;
        return [{ v: typeof fr === 'string' ? fr : null }];
      }
      if (sql.includes("->>'rollbackContainment'")) {
        const rc = e.rollbackContainmentJsonbText !== undefined
          ? e.rollbackContainmentJsonbText
          : (e.result.rollbackContainment === undefined ? null : JSON.stringify(e.result.rollbackContainment));
        return [{ v: rc }];
      }
      throw new Error(`authoritativeReadStub: unmodelled field in $queryRaw — ${sql.slice(0, 90)}`);
    },
  };
}

/** One SUCCESS execution per task carrying `finalResponse`: the common single-run fixture.
 *  undefined ⇒ no execution at all; null ⇒ an execution with no artifact. */
export function authoritativeReadStubFromTexts(texts: Record<string, string | null | undefined>) {
  let t = 0;
  return authoritativeReadStub(
    Object.entries(texts)
      .filter(([, fr]) => fr !== undefined)
      .map(([taskId, fr]) => ({
        id: `exec-${taskId}`, taskId, createdAt: new Date(1_700_000_000_000 + t++ * 1000),
        result: fr === null ? null : { taskId, finalResponse: fr },
      })),
  );
}
