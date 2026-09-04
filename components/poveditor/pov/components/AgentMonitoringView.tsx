"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorContext } from '../context';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Progress } from '@/components/ui/Progress';
import { Textarea } from '@/components/ui/Textarea';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FileText,
  Wrench
} from 'lucide-react';
import {
  AgentService,
  AgentExecutionResponse,
  StreamingAgentExecutionOptions,
  ToolResultCard,
  PromptSnapshot,
  WebSearchCitation,
  WebSearchQuery,
  WebSearchResult
} from '@/lib/pov/api/agent-service';
import { MarkdownRenderer } from './MarkdownRenderer';

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
  outputArtifacts?: any[];
  executionStatus?: string;
  agentLog?: string;
  maxRetries?: number;
  timeout?: number;
  parameters?: Record<string, any>;
}

interface AgentMonitoringViewProps {
  task: Task;
}

/**
 * Activity-feed card (Monitoring Medium, 2026-06-10). A `function_call` SSE
 * event creates a PENDING card; the matching `tool_result_card` event resolves
 * it (tools execute sequentially, so resolution is first-pending-with-same-name).
 * Live-only by design — historical executions' tool forensics live in the
 * Artifacts tab (`result.json.toolCalls`).
 */
interface ActivityCard {
  id: number;
  tool: string;
  pending: boolean;
  turn?: number;
  server?: string;
  success?: boolean;
  durationMs?: number;
  preview?: string;
  error?: string;
}

export const AgentMonitoringView: React.FC<AgentMonitoringViewProps> = ({ task }) => {
  const { updateEntity } = useEditorContext();
  const [isRunning, setIsRunning] = useState(task.executionStatus === 'RUNNING');
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [toolCards, setToolCards] = useState<ActivityCard[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [promptSnapshot, setPromptSnapshot] = useState<PromptSnapshot | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const streamingResponseRef = useRef<HTMLDivElement>(null);

  // Mutable refs for streaming callbacks (immune to stale closures)
  const streamingTextRef = useRef('');
  const currentLogRef = useRef('');
  const toolCardsRef = useRef<ActivityCard[]>([]);
  const cardIdRef = useRef(0);
  
  // Extract execution ID from agent log if available
  useEffect(() => {
    if (task.agentLog && !executionId) {
      const match = task.agentLog.match(/Execution started with ID: ([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        setExecutionId(match[1]);
      }
    }
  }, [task.agentLog, executionId]);
  
  // Poll for execution status updates
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isRunning && executionId) {
      intervalId = setInterval(async () => {
        const response = await AgentService.getExecutionStatus(executionId);
        
        if (response.success && response.data) {
          const executionData = response.data;
          
          // Update task with execution data
          updateEntity('tasks', task.id, {
            executionStatus: executionData.status,
            agentLog: executionData.logs?.join('\n') || task.agentLog,
            outputArtifacts: executionData.artifacts
          });
          
          // Stop polling if execution is complete
          if (executionData.status === 'SUCCESS' || executionData.status === 'FAILED') {
            setIsRunning(false);
            clearInterval(intervalId);
          }
        } else if (!response.success) {
          setError(response.error || 'Failed to get execution status');
          setIsRunning(false);
          clearInterval(intervalId);
        }
      }, 2000); // Poll every 2 seconds
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isRunning, executionId, task.id, updateEntity, task.agentLog]);
  
  // Get execution status badge color
  const getExecutionStatusBadgeColor = (status?: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-muted text-muted-foreground';
      case 'READY':
        return 'bg-info/20 text-info';
      case 'RUNNING':
        return 'bg-primary/20 text-primary';
      case 'PENDING_REVIEW':
        return 'bg-warning/20 text-warning';
      case 'REVIEW_APPROVED':
        return 'bg-success/20 text-success';
      case 'REVIEW_REJECTED':
        return 'bg-destructive/20 text-destructive';
      case 'SUCCESS':
        return 'bg-success/20 text-success';
      case 'FAILED':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };
  
  // Get execution status icon
  const getExecutionStatusIcon = (status?: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4" />;
      case 'READY':
        return <ArrowRight className="h-4 w-4" />;
      case 'RUNNING':
        return <Play className="h-4 w-4" />;
      case 'PENDING_REVIEW':
        return <AlertCircle className="h-4 w-4" />;
      case 'REVIEW_APPROVED':
        return <CheckCircle className="h-4 w-4" />;
      case 'REVIEW_REJECTED':
        return <XCircle className="h-4 w-4" />;
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };
  
  // Handle stop execution
  const handleStopExecution = async () => {
    if (!executionId) {
      setIsRunning(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    // Call agent service to cancel execution
    const response = await AgentService.cancelExecution(executionId);
    
    if (response.success) {
      // Update task with cancellation
      updateEntity('tasks', task.id, {
        executionStatus: 'FAILED',
        agentLog: (task.agentLog || '') + '\n[INFO] Execution canceled at ' + new Date().toISOString()
      });
      setIsRunning(false);
    } else {
      // Handle error
      setError(response.error || 'Failed to cancel execution');
    }
    
    setIsLoading(false);
  };
  
  // Helper: append to log using ref (immune to stale closures)
  const appendLog = useCallback((entry: string) => {
    currentLogRef.current += entry;
    updateEntity('tasks', task.id, {
      agentLog: currentLogRef.current
    });
    // Auto-scroll log textarea
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [task.id, updateEntity]);

  // Handle start streaming execution
  const handleStartStreamingExecution = async () => {
    setIsLoading(true);
    setError(null);
    setStreamingText('');
    streamingTextRef.current = '';
    toolCardsRef.current = [];
    setToolCards([]);
    setExpandedCards(new Set());
    setPromptSnapshot(null);

    // Initialize log with starting message
    const initialLog = '[INFO] Starting streaming execution at ' + new Date().toISOString();
    currentLogRef.current = initialLog;
    updateEntity('tasks', task.id, {
      executionStatus: 'PENDING',
      agentLog: initialLog
    });

    // Prepare agent configuration
    const agentConfig = {
      role: task.agentRole || 'custom',
      prompt: task.prompt || '',
      maxRetries: task.maxRetries,
      timeout: task.timeout,
      parameters: task.parameters
    };

    // Prepare streaming options (all callbacks use refs, not stale closures)
    const streamingOptions: StreamingAgentExecutionOptions = {
      onTextChunk: (text, isComplete) => {
        // Accumulate streaming text in both ref and state
        streamingTextRef.current += text;
        setStreamingText(streamingTextRef.current);

        // Auto-scroll the streaming response panel
        if (streamingResponseRef.current) {
          streamingResponseRef.current.scrollTop = streamingResponseRef.current.scrollHeight;
        }
      },

      onFunctionCall: (functionCall) => {
        appendLog(`\n[INFO] Function call: ${functionCall.name}\n[INFO] Arguments: ${functionCall.arguments}`);
        // Create a PENDING activity card — resolved by onToolResultCard.
        toolCardsRef.current = [
          ...toolCardsRef.current,
          { id: cardIdRef.current++, tool: functionCall.name, pending: true },
        ];
        setToolCards(toolCardsRef.current);
      },

      onPromptSnapshot: (snapshot: PromptSnapshot) => {
        setPromptSnapshot(snapshot);
        appendLog(`\n[INFO] Prompts assembled: system ${snapshot.systemPromptLength.toLocaleString()} chars, user ${snapshot.userPromptLength.toLocaleString()} chars`);
      },

      onToolResultCard: (card: ToolResultCard) => {
        // Resolve the first pending card with the same tool name (tools run
        // sequentially per turn, so order matches); append if none pending.
        const cards = [...toolCardsRef.current];
        const idx = cards.findIndex((c) => c.pending && c.tool === card.tool);
        const resolved: ActivityCard = {
          id: idx >= 0 ? cards[idx].id : cardIdRef.current++,
          pending: false,
          ...card,
        };
        if (idx >= 0) cards[idx] = resolved; else cards.push(resolved);
        toolCardsRef.current = cards;
        setToolCards(cards);
      },

      onWebSearchResults: (results) => {
        let webSearchLog = `\n[INFO] Web search results: ${results.length} results`;
        results.forEach((result, index) => {
          if (result.isError) {
            webSearchLog += `\n  - Error: ${result.errorCode || 'Unknown error'}`;
          } else {
            webSearchLog += `\n  - Result ${index + 1}: ${result.title || 'Untitled'} (${result.url || 'No URL'})`;
            if (result.pageAge) {
              webSearchLog += ` (Last updated: ${result.pageAge})`;
            }
          }
        });
        appendLog(webSearchLog);
      },

      onCitations: (citations: WebSearchCitation[]) => {
        let citationsLog = `\n[INFO] Citations: ${citations.length} citations`;
        citations.forEach((citation, index) => {
          citationsLog += `\n  - Citation ${index + 1}: ${citation.title || 'Untitled'} (${citation.url || 'No URL'})`;
          if (citation.cited_text) {
            citationsLog += `\n    "${citation.cited_text.substring(0, 100)}${citation.cited_text.length > 100 ? '...' : ''}"`;
          }
        });
        appendLog(citationsLog);
      },

      onSearchQueries: (queries: WebSearchQuery[]) => {
        let queriesLog = `\n[INFO] Search queries: ${queries.length} queries`;
        queries.forEach((query, index) => {
          queriesLog += `\n  - Query ${index + 1}: "${query.query}"`;
        });
        appendLog(queriesLog);
      },

      onLogUpdate: (logs) => {
        // Server sends full log array — replace current log
        currentLogRef.current = logs.join('\n');
        updateEntity('tasks', task.id, {
          agentLog: currentLogRef.current
        });
      },

      onExecutionUpdate: (status, endTime) => {
        updateEntity('tasks', task.id, {
          executionStatus: status
        });
        if (status === 'SUCCESS' || status === 'FAILED') {
          setIsRunning(false);
        }
      },

      onArtifactCreated: (artifact) => {
        appendLog(`\n[INFO] Artifact created: ${artifact.name} (${artifact.type})`);
      },

      onError: (error) => {
        appendLog(`\n[ERROR] ${error.message}`);
        updateEntity('tasks', task.id, {
          executionStatus: 'FAILED'
        });
        setError(error.message);
        setIsRunning(false);
      },

      onComplete: () => {
        appendLog(`\n[INFO] Streaming execution completed at ${new Date().toISOString()}`);
        setIsLoading(false);
      }
    };

    // Call agent service to execute agent with streaming
    const newExecutionId = await AgentService.executeAgentWithStreaming({
      taskId: task.id,
      agentConfig,
      context: task.inputContext
    }, streamingOptions);

    if (newExecutionId) {
      setExecutionId(newExecutionId);
      setIsRunning(true);
      appendLog(`\n[INFO] Execution started with ID: ${newExecutionId}`);
    } else {
      setError('Failed to start streaming execution');
      appendLog('\n[ERROR] Failed to start streaming execution');
      updateEntity('tasks', task.id, {
        executionStatus: 'FAILED'
      });
      setIsLoading(false);
    }
  };
  
  // Handle reset execution
  const handleResetExecution = async () => {
    setIsRunning(false);
    setExecutionId(null);
    setError(null);
    setStreamingText('');
    streamingTextRef.current = '';
    currentLogRef.current = '';
    toolCardsRef.current = [];
    setToolCards([]);
    setExpandedCards(new Set());
    setPromptSnapshot(null);

    updateEntity('tasks', task.id, {
      executionStatus: 'PENDING',
      agentLog: '',
      outputArtifacts: undefined
    });
  };
  
  // Check if agent is configured — PIPELINE tasks count as configured because
  // they get the Pipeline Harness template auto-assigned at execution time
  const isAgentConfigured = (!!task.agentRole && !!task.prompt) || task.type === 'PIPELINE';
  
  // Toggle an activity card's expanded state
  const toggleCard = (id: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Get progress percentage based on status
  const getProgressPercentage = (status?: string) => {
    switch (status) {
      case 'PENDING':
        return 0;
      case 'READY':
        return 10;
      case 'RUNNING':
        return 50;
      case 'PENDING_REVIEW':
        return 75;
      case 'REVIEW_APPROVED':
      case 'REVIEW_REJECTED':
        return 90;
      case 'SUCCESS':
      case 'FAILED':
        return 100;
      default:
        return 0;
    }
  };
  
  return (
    <div className="space-y-6">
      {!isAgentConfigured ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Agent is not fully configured. Please configure the agent role and prompt in the Configuration tab.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Status:</span>
              <Badge className={getExecutionStatusBadgeColor(task.executionStatus)}>
                <div className="flex items-center">
                  {getExecutionStatusIcon(task.executionStatus)}
                  <span className="ml-1">{task.executionStatus || 'PENDING'}</span>
                </div>
              </Badge>
            </div>
            
            <div className="flex items-center space-x-2">
                {task.executionStatus !== 'RUNNING' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartStreamingExecution}
                    disabled={task.executionStatus === 'SUCCESS' || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1" />
                    )}
                    Execute
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStopExecution}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Pause className="h-4 w-4 mr-1" />
                    )}
                    Stop
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetExecution}
                  disabled={isRunning || isLoading}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{getProgressPercentage(task.executionStatus)}%</span>
            </div>
            <Progress value={getProgressPercentage(task.executionStatus)} />
          </div>
          
          {/* Activity — live tool-call cards grouped by turn (Monitoring Medium,
              2026-06-10). Collapsed by default: "✓ tool · Nms", click to expand
              a wrapped, height-clamped result preview. LIVE-ONLY by design —
              historical runs' tool forensics live in the Artifacts tab
              (result.json.toolCalls). */}
          {toolCards.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <Wrench className="h-4 w-4" />
                Activity
                <Badge variant="secondary" className="text-xs ml-1">
                  {toolCards.filter((c) => !c.pending).length}/{toolCards.length} tools
                </Badge>
              </h3>
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {toolCards.map((card, i) => {
                  const prevTurn = i > 0 ? toolCards[i - 1].turn : undefined;
                  const showTurnHeader =
                    !card.pending && card.turn !== undefined && card.turn !== prevTurn;
                  return (
                    <React.Fragment key={card.id}>
                      {showTurnHeader && (
                        <div className="text-xs font-medium text-muted-foreground pt-1.5">
                          Turn {card.turn}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => !card.pending && toggleCard(card.id)}
                        className="w-full flex items-center gap-2 text-left text-xs rounded border border-border px-2 py-1.5 hover:bg-muted/50 transition-colors"
                      >
                        {card.pending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                        ) : expandedCards.has(card.id) ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {!card.pending && (
                          card.success ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )
                        )}
                        <span className="font-mono">{card.tool}</span>
                        {card.error && (
                          <span className="text-red-500 truncate">{card.error}</span>
                        )}
                        {!card.pending && (
                          <span className="text-muted-foreground ml-auto shrink-0">
                            {card.durationMs}ms
                          </span>
                        )}
                        {card.pending && (
                          <span className="text-muted-foreground ml-auto shrink-0">running…</span>
                        )}
                      </button>
                      {expandedCards.has(card.id) && card.preview && (
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto rounded border border-border bg-muted/30 p-2 ml-5">
                          {card.preview}
                        </pre>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agent Response — live PROSE while running (tool dumps now render
              as Activity cards, not text). On completion: handoff stub — the
              deliverable lives in the Artifacts tab (report.md), no duplication. */}
          {streamingText && task.executionStatus !== 'SUCCESS' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  Agent Response
                  {isRunning && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary ml-1" />
                  )}
                </h3>
              </div>
              <div
                ref={streamingResponseRef}
                className="max-h-[500px] overflow-y-auto"
              >
                <MarkdownRenderer
                  content={streamingText}
                  className="min-h-[100px]"
                />
              </div>
            </div>
          )}
          {task.executionStatus === 'SUCCESS' && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Execution completed
                {toolCards.length > 0 && <> — {toolCards.filter((c) => !c.pending).length} tool call(s)</>}
                . View the full report in the <strong>Artifacts</strong> tab.
                {streamingText && (
                  <span className="block mt-1 text-xs text-muted-foreground line-clamp-3">
                    {streamingText.slice(0, 500)}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Collapsible Prompts panel (live-only, 2026-06-10): the EXACT
              runtime-assembled prompts this run's LLM received — the only
              place they're visible (not persisted anywhere; documented gap).
              Gone after reload, by design. */}
          {promptSnapshot && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowPrompts(!showPrompts)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPrompts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Prompts (this run)
                <Badge variant="secondary" className="text-xs ml-1">
                  sys {(promptSnapshot.systemPromptLength / 1000).toFixed(1)}k · user {(promptSnapshot.userPromptLength / 1000).toFixed(1)}k chars
                </Badge>
              </button>
              {showPrompts && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">System prompt (runtime-assembled: template + protocol + tool guidance)</div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto rounded border border-border bg-muted/30 p-2">
                    {promptSnapshot.systemPrompt}
                  </pre>
                  <div className="text-xs font-medium text-muted-foreground">User prompt (§1–§8)</div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto rounded border border-border bg-muted/30 p-2">
                    {promptSnapshot.userPrompt}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Execution Log */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowLog(!showLog)}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showLog ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Execution Log
              {task.agentLog && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {(task.agentLog.match(/\n/g) || []).length + 1} lines
                </Badge>
              )}
            </button>
            {showLog && (
              <Textarea
                ref={logRef}
                value={task.agentLog || ''}
                readOnly
                className="font-mono text-xs h-[200px]"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};
