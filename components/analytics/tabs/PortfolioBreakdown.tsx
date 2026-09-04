'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export interface PortfolioProject {
  id: string;
  title: string;
  status: string;
  theatre: string | null;
  owner: string | null;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

/**
 * Portfolio Breakdown — per-POV table shown on the Overview tab when "All Projects" is selected.
 * Data comes from the overview domain's `projects[]` (scoped to accessible POVs). Rows link to the
 * POV editor. Project is left-aligned; the rest are right-aligned with headers over their values.
 */
export function PortfolioBreakdown({ projects }: { projects: PortfolioProject[] }) {
  const router = useRouter();

  if (!projects || projects.length === 0) return null;

  const sorted = [...projects].sort((a, b) => b.completionRate - a.completionRate);

  // Inline style (not bg-* classes) so the fill color isn't purged by Tailwind.
  const barColor = (pct: number) => (pct >= 80 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444');

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Projects ({projects.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2 text-left">Project</th>
                <th className="px-4 py-2 text-right">Status</th>
                <th className="px-4 py-2 text-right">Completion</th>
                <th className="px-4 py-2 text-right">Tasks</th>
                <th className="px-4 py-2 text-right">Owner</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/pov/edit/${p.id}`)}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted"
                >
                  <td className="max-w-[360px] truncate px-4 py-2 font-medium" title={p.title}>{p.title}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted-foreground">{p.status}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${p.completionRate}%`, backgroundColor: barColor(p.completionRate) }}
                        />
                      </div>
                      <span className="w-10 text-right tabular-nums">{p.completionRate}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {p.completedTasks}/{p.totalTasks}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-right text-xs text-muted-foreground" title={p.owner || ''}>
                    {p.owner || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
