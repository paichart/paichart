'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loader2, DollarSign } from 'lucide-react';

/**
 * Admin durable LLM cost panel (token-usage-persistence Phase 2 #1).
 * Fetches GET /api/analytics?domain=admin&metrics=token-cost — the UNION of the token_usage_daily
 * rollup (historical, pruned) + live executions. Cost is derived server-side, priced as-of each
 * execution's date (Protocol 10). `durable: true` distinguishes this all-time view from the per-POV
 * rolling window on /analytics.
 */
interface TokenCostByModel {
  model: string;
  executions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
interface TokenCost {
  timeRange: string;
  totalExecutions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  costCoverage: number;
  durable: boolean;
  rollupBuckets: number;
  liveExecutions: number;
  byModel: TokenCostByModel[];
}
interface TokenCostResponse {
  data?: { tokenCost?: TokenCost };
}

const fmtUsd = (usd: number) =>
  usd > 0 && usd < 1 ? `$${usd.toFixed(usd < 0.01 ? 4 : 2)}` : `$${usd.toFixed(2)}`;
const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : `${n}`;

export function TokenCostPanel() {
  const { data, isLoading, error } = useQuery<TokenCostResponse>({
    queryKey: ['admin-token-cost'],
    queryFn: async () => {
      const res = await fetch('/api/analytics?domain=admin&metrics=token-cost');
      if (!res.ok) throw new Error('Failed to fetch token cost');
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading LLM cost…</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data?.data?.tokenCost) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/10">
        <CardContent className="p-6">
          <p className="text-center text-yellow-400">
            LLM cost data unavailable (no executions with token data yet, or a temporary issue).
          </p>
        </CardContent>
      </Card>
    );
  }

  const c = data.data.tokenCost;
  const coveragePct = Math.round((c.costCoverage ?? 0) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-green-500" />
          LLM Cost
          {c.durable && (
            <Badge variant="outline" className="text-[10px] border-green-500/40 text-green-500">
              durable · all-time
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <span className="text-2xl font-semibold text-green-500">{fmtUsd(c.totalCostUsd)}</span>
            <span className="ml-2 text-xs text-muted-foreground">total</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtNum(c.totalInputTokens)} in · {fmtNum(c.totalOutputTokens)} out ·{' '}
            {fmtNum(c.totalExecutions)} runs
          </div>
          <div className="text-xs text-muted-foreground">
            {c.rollupBuckets} rollup + {c.liveExecutions} live
            {coveragePct < 100 && (
              <span
                className="ml-2 text-yellow-500"
                title="Some executions are pre-2026-07-02 (no token data) or on unpriceable models — the total is a floor."
              >
                · {coveragePct}% priced
              </span>
            )}
          </div>
        </div>

        {/* Per-model breakdown (spend descending) */}
        {c.byModel.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1 text-left font-medium">Model</th>
                  <th className="py-1 text-right font-medium">Runs</th>
                  <th className="py-1 text-right font-medium">In</th>
                  <th className="py-1 text-right font-medium">Out</th>
                  <th className="py-1 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {c.byModel.map((m) => (
                  <tr key={m.model} className="border-b border-border/50">
                    <td className="py-1 text-left font-mono">{m.model}</td>
                    <td className="py-1 text-right">{fmtNum(m.executions)}</td>
                    <td className="py-1 text-right">{fmtNum(m.inputTokens)}</td>
                    <td className="py-1 text-right">{fmtNum(m.outputTokens)}</td>
                    <td className="py-1 text-right text-green-500">{fmtUsd(m.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
