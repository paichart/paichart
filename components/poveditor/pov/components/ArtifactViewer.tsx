"use client";

import React, { useState, useEffect } from 'react';
import { useEditorContext } from '../context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { 
  FileText, 
  Code, 
  Image as ImageIcon, 
  Download, 
  AlertCircle, 
  Copy, 
  Check,
  File,
  Loader2,
  FileJson,
  FileCode,
  Info
} from 'lucide-react';
import { AgentService } from '@/lib/pov/api/agent-service';
import { ArtifactContent } from './ArtifactContent';
import { useToast } from '@/lib/hooks/useToast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';

// Static field guide for the result.json "Info" dialog. A schema explainer, not a
// per-artifact parse — result.json is built by the shared execution core, so the
// structure is identical on the GUI (stream) and MCP (engine) execution paths.
const RESULT_JSON_FIELD_GROUPS: { title: string; note?: string; fields: { name: string; desc: string }[] }[] = [
  {
    title: 'Identity',
    fields: [
      { name: 'taskId / taskTitle', desc: 'The task this execution belongs to.' },
      { name: 'agentRole', desc: 'Resolved role that drove the system prompt (e.g. technical_consultant).' },
      { name: 'modelUsed', desc: 'The LLM the provider actually served.' },
      { name: 'generatedAt', desc: 'ISO timestamp the result.json was built.' },
    ],
  },
  {
    title: 'Deliverable & confidence',
    fields: [
      { name: 'finalResponse', desc: 'The deliverable text (last-turn output).' },
      { name: 'confidenceScore', desc: 'Self-reported 0-100 confidence (last-match-wins).' },
      { name: 'originalConfidence / confidenceCapped', desc: 'Present only when the objective guard capped confidence to 60 (tool-failure rate over 50%).' },
    ],
  },
  {
    title: 'Quality signals',
    fields: [
      { name: 'executionDegradation', desc: 'Additive degradation signal from the quality cascade (never changes SUCCESS/FAILED).' },
      { name: 'protocolValidation', desc: 'Pipeline-protocol step validation (harness runs).' },
      { name: 'resolvedMode / resolvedReasonCode', desc: 'Harness execution mode - present only for PIPELINE-context runs.' },
      { name: 'templateScopeMismatch', desc: 'RETIRED 2026-07-17 (P9 signal, ~100% FPR) — appears only in artifacts written before that date.' },
    ],
  },
  {
    title: 'Metrics',
    fields: [
      { name: 'qualityMetrics.toolCallSuccess', desc: 'total / succeeded / failed tool calls.' },
      { name: 'qualityMetrics.totalTurns / hitMaxTurns / responseLength', desc: 'Loop turn count, whether it hit the cap, deliverable length.' },
      { name: 'keepBestFacts', desc: 'deliverableChars, fencedBlockCount, and scoreIntegrity - inputs to keep-best retry selection.' },
    ],
  },
  {
    title: 'Timing & tokens',
    note: 'executionTime is wall-clock (endTime minus startTime) - the same formula on both the GUI (stream) and MCP (engine) paths.',
    fields: [
      { name: 'executionTime', desc: 'Total execution time in milliseconds.' },
      { name: 'tokensUsed', desc: 'Input + output tokens (raw sum; 0 is a legitimate value).' },
      { name: 'mcpToolsProvided', desc: 'Tools that were made available to the agent.' },
    ],
  },
  {
    title: 'Tool loop',
    fields: [
      { name: 'toolCalls', desc: 'Per-turn tool-execution transcript, truncated by a shared cap - this is the bulk of the file.' },
      { name: 'toolLoop', desc: 'totalTurns, hitMaxTurns, totalToolExecutions, correctionTurnUsed, budgetFailFastUsed, diagnosticRetryUsed, truncationRetryUsed, truncationRetryRecovered.' },
    ],
  },
  {
    title: 'Extensions (GUI / stream path only)',
    note: 'Emitted only by the streaming (GUI) path, and only when the model produced them. The MCP (engine) path omits these by design.',
    fields: [
      { name: 'functionCall', desc: 'The function/tool call payload captured live during the loop.' },
      { name: 'webSearchResults / citations / searchQueries', desc: 'Web-search results, citations, and queries when the run used web search.' },
    ],
  },
];

interface Artifact {
  id: string;
  name: string;
  type: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

/** Artifact + its originating execution context — used for the cross-execution list */
interface ArtifactWithExecution extends Artifact {
  executionId: string;
  executionStatus: string;
  executionStartTime: string | null;
}

/** Row shape returned by /api/agent-executions */
interface ExecutionRowLite {
  id: string;
  status: string;
  startTime: string | null;
  agentRole?: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type?: string;
  priority?: string;
  dueDate?: string;
  agentRole?: string;
  prompt?: string;
  inputContext?: any;
  outputArtifacts?: Artifact[];
  executionStatus?: string;
  agentLog?: string;
  maxRetries?: number;
  timeout?: number;
}

interface ArtifactViewerProps {
  task: Task;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ task }) => {
  const { toast } = useToast();
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2026-04-20 (Option B): fetch artifacts across ALL executions for this task,
  // not just the latest denormalized-on-task.outputArtifacts one. Prior behaviour
  // hid earlier executions' artifacts when the task had multiple runs (e.g. the
  // pre-L3 assign×execute race's duplicate CREATE runs, or any budget-exhausted
  // retry after a successful earlier run). See:
  //   cline_docs/reviews/pipeline-context-a6-2026-04-18/ (context for the session)
  const [executions, setExecutions] = useState<ExecutionRowLite[]>([]);
  const [allArtifacts, setAllArtifacts] = useState<ArtifactWithExecution[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 1. Fetch all executions for this task (newest-first).
        const execUrl = `/api/agent-executions?taskId=${encodeURIComponent(task.id)}&limit=20&sortBy=startTime&sortOrder=desc&dateRange=all`;
        const execRes = await fetch(execUrl);
        if (!execRes.ok) throw new Error(`Failed to fetch executions (HTTP ${execRes.status})`);
        const execPayload = await execRes.json();
        const execs: ExecutionRowLite[] =
          execPayload?.data?.executions ?? execPayload?.executions ?? execPayload?.data ?? [];
        if (!alive) return;
        setExecutions(execs);

        // 2. Fetch artifacts for each execution in parallel. Some executions
        //    (FAILED / PENDING / CANCELLED) may have no artifacts — that's fine;
        //    they still appear as rows with "No artifacts" under the exec header.
        const perExec = await Promise.all(
          execs.map(async (exec) => {
            const r = await AgentService.getArtifacts(exec.id);
            return r.success && r.data ? (r.data as Artifact[]) : [];
          })
        );
        if (!alive) return;

        // 3. Flatten — each artifact carries its originating execution context
        //    so the detail panel can show Execution + Status lines.
        const flat: ArtifactWithExecution[] = execs.flatMap((e, i) =>
          perExec[i].map((a) => ({
            ...a,
            executionId: e.id,
            executionStatus: e.status,
            executionStartTime: e.startTime,
          }))
        );
        setAllArtifacts(flat);

        // 2026-04-20 (#2): canonical default-selection.
        // Prefer the most useful artifact, not just the newest:
        //   1. SYNTHESIZE-mode SUCCESS  (harness fully synthesised)
        //   2. CREATE-mode SUCCESS      (pipeline created, not yet synthesised)
        //   3. Any SUCCESS              (non-harness specialist artifact)
        //   4. Newest of anything       (last-resort fallback)
        // On racy / retry-heavy histories the newest execution is often the
        // LEAST useful (e.g., budget-exhausted retry). This picks the canonical
        // result a user would actually want to read first.
        if (flat.length > 0) {
          setSelectedArtifactId((prev) => prev ?? pickCanonicalArtifact(flat).id);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load artifacts');
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [task.id]);

  // The currently-selected artifact (may be null if nothing selected or empty state).
  const selectedArtifact = selectedArtifactId
    ? allArtifacts.find((a) => a.id === selectedArtifactId)
    : allArtifacts[0];

  // Execution id to use for the download-via-API path.
  const executionId = selectedArtifact?.executionId ?? null;

  // 2026-04-20: extract harness mode from artifact content for the detail panel.
  // Harness `pipeline-index.json` carries:
  //  - `resolvedMode` (added 2026-04-26 — pre-execution, platform-resolved)
  //  - `protocolValidation.mode` (post-execution, validator-derived from tool log)
  //
  // 2026-04-26 fallback chain (per boundary-contract C-BC1): read resolver result
  // first (covers budget-exhausted runs where validator block is absent), fall back
  // to validator for legacy artifacts that pre-date the resolver. Both mean the
  // same thing in the happy path; resolver wins under degradation.
  // See: cline_docs/reviews/mode-detection-out-of-llm-turn-2026-04-26/
  const selectedArtifactMode = React.useMemo<string | null>(() => {
    if (!selectedArtifact?.content) return null;
    try {
      const parsed = JSON.parse(selectedArtifact.content);
      const mode = parsed?.resolvedMode ?? parsed?.protocolValidation?.mode;
      return typeof mode === 'string' && mode.length > 0 ? mode : null;
    } catch {
      // Non-JSON content (e.g. report.md) — no mode to extract.
      return null;
    }
  }, [selectedArtifact]);

  // Shim used by the empty-state check + legacy callers further down.
  const artifacts = allArtifacts;
  
  // Get artifact icon
  const getArtifactIcon = (type: string, name: string = '') => {
    // Check file extension
    const extension = name.split('.').pop()?.toLowerCase() || '';
    
    // Determine icon based on type and extension
    if (type === 'code' || /\.(js|ts|jsx|tsx|py|java|c|cpp|cs|go|rb|php|swift|kt|rs|sql)$/i.test(name)) {
      return <FileCode className="h-4 w-4" />;
    }
    
    if (type === 'json' || extension === 'json') {
      return <FileJson className="h-4 w-4" />;
    }
    
    if (type === 'markdown' || /\.(md|markdown)$/i.test(name)) {
      return <FileText className="h-4 w-4" />;
    }
    
    if (type === 'text' || /\.(txt|log|csv|tsv)$/i.test(name)) {
      return <FileText className="h-4 w-4" />;
    }
    
    if (type === 'image' || /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(name)) {
      return <ImageIcon className="h-4 w-4" />;
    }
    
    if (type === 'html' || /\.(html|htm)$/i.test(name)) {
      return <Code className="h-4 w-4" />;
    }
    
    // Default icon
    return <File className="h-4 w-4" />;
  };
  
  // Handle copy to clipboard
  const handleCopy = async () => {
    if (selectedArtifact) {
      try {
        await navigator.clipboard.writeText(selectedArtifact.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        
        // Show success toast
        toast({
          title: "Copied",
          description: "Artifact content copied to clipboard",
          variant: "default",
        });
      } catch {
        // Show error toast
        toast({
          title: "Copy Failed",
          description: "Failed to copy content to clipboard",
          variant: "destructive",
        });
      }
    }
  };
  
  // Handle download artifact
  const handleDownload = async () => {
    if (!selectedArtifact) return;
    
    setIsLoading(true);
    
    try {
      // Determine content type based on artifact type
      let mimeType = 'text/plain';
      if (selectedArtifact.type === 'application/json') {
        mimeType = 'application/json';
      } else if (selectedArtifact.type === 'text/markdown') {
        mimeType = 'text/markdown';
      } else if (selectedArtifact.type === 'text/html') {
        mimeType = 'text/html';
      } else if (selectedArtifact.type === 'text/plain') {
        mimeType = 'text/plain';
      }
      
      // Try API download first if we have execution ID
      if (executionId) {
        try {
          const response = await AgentService.downloadArtifact(executionId, selectedArtifact.id);
          
          if (response.success && response.data) {
            // Create download link from API response
            const url = URL.createObjectURL(response.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedArtifact.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Show success toast
            toast({
              title: "Downloaded",
              description: `${selectedArtifact.name} downloaded successfully`,
              variant: "default",
            });
            
            setIsLoading(false);
            return;
          }
        } catch {
          // API download failed, using fallback
        }
      }
      
      // Fallback: Create blob from artifact content
      const blob = new Blob([selectedArtifact.content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedArtifact.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // Show success toast (no mention of fallback method)
      toast({
        title: "Downloaded",
        description: `${selectedArtifact.name} downloaded successfully`,
        variant: "default",
      });
      
    } catch {
      // Show error toast
      toast({
        title: "Download Failed",
        description: "Failed to download artifact. Please try again.",
        variant: "destructive",
      });
    }
    
    setIsLoading(false);
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch (error) {
      return dateString;
    }
  };

  /**
   * Pick the canonical artifact from a flat list spanning multiple executions.
   * Preference order: SYNTHESIZE SUCCESS > CREATE SUCCESS > any SUCCESS > newest.
   * See the inline comment on the effect that calls this for rationale.
   */
  function pickCanonicalArtifact(artifacts: ArtifactWithExecution[]): ArtifactWithExecution {
    if (artifacts.length === 0) {
      throw new Error('pickCanonicalArtifact called on empty list');
    }
    // Parse mode per artifact (only harness pipeline-index.json has it).
    // Fallback chain (per boundary-contract C-BC1, 2026-04-26): resolver-written
    // resolvedMode first (covers budget-exhausted runs), validator-written
    // protocolValidation.mode second (legacy + happy path).
    const withMode = artifacts.map((a) => {
      let mode: 'SYNTHESIZE' | 'CREATE' | 'ORCHESTRATE' | null = null;
      try {
        const parsed = JSON.parse(a.content);
        const m = parsed?.resolvedMode ?? parsed?.protocolValidation?.mode;
        if (m === 'SYNTHESIZE' || m === 'CREATE' || m === 'ORCHESTRATE') mode = m;
      } catch {
        // Non-JSON content (report.md, etc.) — mode stays null.
      }
      return { artifact: a, mode };
    });
    const firstMatching = (pred: (x: { artifact: ArtifactWithExecution; mode: string | null }) => boolean) =>
      withMode.find(pred)?.artifact;
    return (
      firstMatching((x) => x.mode === 'SYNTHESIZE' && x.artifact.executionStatus === 'SUCCESS') ||
      firstMatching((x) => x.mode === 'CREATE' && x.artifact.executionStatus === 'SUCCESS') ||
      firstMatching((x) => x.artifact.executionStatus === 'SUCCESS') ||
      artifacts[0]
    );
  }
  
  return (
    <div className="space-y-6">
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading artifacts...</span>
        </div>
      ) : artifacts.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No artifacts available. Run the agent to generate artifacts.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="flex space-x-4">
            <div className="w-1/3 border rounded-md overflow-hidden">
              <div className="bg-muted/30 p-3 border-b">
                <h3 className="font-medium">
                  Artifacts ({allArtifacts.length})
                  {executions.length > 1 && (
                    <span className="text-xs text-muted-foreground font-normal ml-2">
                      across {executions.length} executions
                    </span>
                  )}
                </h3>
              </div>
              <div className="p-2 space-y-3 max-h-[500px] overflow-y-auto">
                {/* 2026-04-20 (Option B): group artifacts by execution so users
                    can see the arc of runs on a task with retries (budget-exhausted,
                    race-duplicated, etc). Each execution gets a subheader; rows
                    underneath are its artifacts. */}
                {executions.map((exec) => {
                  const execArtifacts = allArtifacts.filter((a) => a.executionId === exec.id);
                  const statusClass =
                    exec.status === 'SUCCESS'
                      ? 'text-green-400'
                      : exec.status === 'FAILED'
                      ? 'text-red-400'
                      : exec.status === 'RUNNING'
                      ? 'text-amber-400'
                      : 'text-muted-foreground';
                  return (
                    <div key={exec.id}>
                      <div className="px-2 py-1.5 bg-muted/30 rounded-sm mb-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground" title={exec.id}>
                            exec:{exec.id.substring(0, 12)}…
                          </span>
                          <span className={`font-bold ${statusClass}`}>{exec.status}</span>
                        </div>
                        {exec.startTime && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {formatDate(exec.startTime)}
                          </div>
                        )}
                      </div>
                      {execArtifacts.length > 0 ? (
                        execArtifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            className={`p-2 rounded-md cursor-pointer flex items-center ${
                              selectedArtifact?.id === artifact.id ? 'bg-primary/10' : 'hover:bg-muted/20'
                            }`}
                            onClick={() => setSelectedArtifactId(artifact.id)}
                          >
                            {getArtifactIcon(artifact.type, artifact.name)}
                            <span className="ml-2 flex-1 truncate">{artifact.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {artifact.type}
                            </Badge>
                          </div>
                        ))
                      ) : (
                        <div className="px-2 py-1 text-xs text-muted-foreground italic">
                          No artifacts for this execution.
                        </div>
                      )}
                    </div>
                  );
                })}
                {executions.length === 0 && !isLoading && (
                  <div className="px-2 py-4 text-xs text-muted-foreground italic text-center">
                    No executions found for this task.
                  </div>
                )}
              </div>
            </div>

            <div className="w-2/3 border rounded-md overflow-hidden">
              {selectedArtifact ? (
                <>
                  <div className="bg-muted/30 p-3 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{selectedArtifact.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Created: {formatDate(selectedArtifact.createdAt)}
                      </p>
                      {/* Harness mode (2026-04-20): surfaced from
                          content.protocolValidation.mode on pipeline-index.json.
                          Absent for specialist artifacts + budget-exhausted harness
                          runs — the line is skipped in those cases. */}
                      {selectedArtifactMode && (
                        <p className="text-xs text-muted-foreground">
                          Mode: <span className="font-bold text-amber-400">{selectedArtifactMode}</span>
                        </p>
                      )}
                      {/* 2026-04-20 (Option B): self-identifying detail — each artifact
                          shows which execution produced it + that execution's status. */}
                      {selectedArtifact.executionId && (
                        <p className="text-xs text-muted-foreground">
                          Execution: <span className="font-mono">{selectedArtifact.executionId}</span>
                        </p>
                      )}
                      {selectedArtifact.executionStatus && (
                        <p className="text-xs text-muted-foreground">
                          Exec status:{' '}
                          <span
                            className={
                              selectedArtifact.executionStatus === 'SUCCESS'
                                ? 'text-green-400 font-bold'
                                : selectedArtifact.executionStatus === 'FAILED'
                                ? 'text-red-400 font-bold'
                                : ''
                            }
                          >
                            {selectedArtifact.executionStatus}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopy}
                        disabled={isLoading}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 mr-1" />
                        ) : (
                          <Copy className="h-4 w-4 mr-1" />
                        )}
                        {copied ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1" />
                        )}
                        Download
                      </Button>
                      {selectedArtifact.name === 'result.json' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowInfo(true)}
                        >
                          <Info className="h-4 w-4 mr-1" />
                          Fields
                        </Button>
                      )}
                    </div>
                    {selectedArtifact.name === 'result.json' && (
                      <Dialog open={showInfo} onOpenChange={setShowInfo}>
                        <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>result.json — field guide</DialogTitle>
                            <DialogDescription>
                              Forensic breakdown of an agent execution. Built by the shared execution core, so the structure is identical on the GUI (stream) and MCP (engine) paths.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 text-sm">
                            <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                              <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                              <div>
                                <p className="font-semibold text-blue-800 dark:text-blue-300">Data retention</p>
                                <p className="mt-1 text-xs leading-relaxed text-blue-700 dark:text-blue-300/90">
                                  Executions and their artifacts aren&apos;t kept indefinitely. Each task retains only
                                  its most recent runs — older executions are pruned automatically to keep storage
                                  bounded — and artifacts are also removed once they pass a maximum age. Your latest
                                  (best-scoring) deliverable and aggregated token-cost history are preserved even after
                                  older runs are pruned.
                                </p>
                              </div>
                            </div>
                            {RESULT_JSON_FIELD_GROUPS.map((group) => (
                              <div key={group.title}>
                                <h4 className="font-semibold mb-1">{group.title}</h4>
                                {group.note && (
                                  <p className="text-xs italic text-gray-500 dark:text-gray-400 mb-1.5">{group.note}</p>
                                )}
                                <div className="space-y-1">
                                  {group.fields.map((f) => (
                                    <div key={f.name}>
                                      <code className="font-mono text-xs text-blue-500">{f.name}</code>
                                      <span className="text-gray-600 dark:text-gray-400"> — {f.desc}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                  <ArtifactContent 
                    artifact={selectedArtifact}
                    error={error}
                  />
                </>
              ) : (
                <div className="p-6 text-center text-muted-foreground">
                  Select an artifact to view its content
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
