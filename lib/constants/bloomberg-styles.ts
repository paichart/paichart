/**
 * Bloomberg Terminal Design System
 * Shared constants for consistent Bloomberg-style UI across dashboard and POV views
 */

/**
 * Status Symbol Mapping
 * Bloomberg terminal style - consistent across all views
 */
export interface StatusSymbol {
  symbol: string;
  color: string;
  bg: string;
}

export const STATUS_SYMBOLS: Record<string, StatusSymbol> = {
  PROJECTED: {
    symbol: '○',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10'
  },
  VALIDATION: {
    symbol: '◐',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10'
  },
  IN_PROGRESS: {
    symbol: '●',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10'
  },
  WON: {
    symbol: '✓',
    color: 'text-green-400',
    bg: 'bg-green-500/10'
  },
  LOST: {
    symbol: '✗',
    color: 'text-red-400',
    bg: 'bg-red-500/10'
  },
  STALLED: {
    symbol: '‖',
    color: 'text-gray-400',
    bg: 'bg-gray-500/10'
  },
};

/**
 * Priority Display Mapping
 * Abbreviated for Bloomberg terminal density
 */
export interface PriorityDisplay {
  text: string;
  color: string;
}

export const PRIORITY_DISPLAY: Record<string, PriorityDisplay> = {
  CRITICAL: { text: 'CRIT', color: 'text-red-400' },
  HIGH: { text: 'HIGH', color: 'text-orange-400' },
  MEDIUM: { text: 'MED', color: 'text-yellow-400' },
  LOW: { text: 'LOW', color: 'text-green-400' },
};

/**
 * Bloomberg Color Palette
 * Core colors used throughout Bloomberg-style interfaces
 */
export const BLOOMBERG_COLORS = {
  // Primary accent (active UI elements, titles)
  accent: 'text-amber-400',
  accentBg: 'bg-amber-500/10',

  // Status colors
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
  info: 'text-blue-400',

  // Data visualization
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  neutral: 'text-gray-400',

  // Typography
  foreground: 'text-foreground',
  muted: 'text-muted-foreground',
};

/**
 * Bloomberg Header Style
 * Consistent header bar styling
 */
export const BLOOMBERG_HEADER = {
  container: 'bg-muted border-b border-border text-xs px-3 py-1.5',
  title: 'text-amber-400 font-bold',
  separator: 'text-muted-foreground',
  metric: 'text-muted-foreground',
};

/**
 * Bloomberg Table Style
 * Consistent table styling for dense information display
 */
export const BLOOMBERG_TABLE = {
  container: 'bg-background border border-border overflow-hidden',
  header: 'px-3 py-1.5 bg-muted border-b text-xs',
  headerTitle: 'text-amber-400 font-bold',
  thead: 'border-b bg-muted/30',
  th: 'text-left px-3 py-1.5 text-muted-foreground font-normal',
  rowEven: 'bg-background',
  rowOdd: 'bg-muted/30',
  rowHover: 'hover:bg-accent transition-colors',
  td: 'px-3 py-1.5',
  tdNumber: 'text-muted-foreground',
};

/**
 * Bloomberg List Style
 * For dense list views (e.g., Phase Bottlenecks)
 */
export const BLOOMBERG_LIST = {
  container: 'bg-background border border-border',
  header: 'px-3 py-1.5 bg-muted border-b text-xs',
  divider: 'divide-y divide-border',
  item: 'px-3 py-2 hover:bg-accent transition-colors cursor-pointer text-xs',
  itemNumber: 'text-muted-foreground',
};

/**
 * Bloomberg Typography
 * Font family and text size conventions
 */
export const BLOOMBERG_TYPOGRAPHY = {
  mono: 'font-mono',
  titleSize: 'text-xs',       // Section headers like "AT-RISK POVs"
  bodySize: 'text-xs',        // Table data
  labelSize: 'text-[10px]',   // Tiny labels, Y-axis
  metricSize: 'text-sm',      // Key metrics in header bar
  heroSize: 'text-lg',        // Big numbers like health score
  uppercase: 'uppercase tracking-wide',
};

/**
 * Bloomberg Spacing
 * Consistent padding and spacing values
 */
export const BLOOMBERG_SPACING = {
  headerPadding: 'px-3 py-1.5',
  cellPadding: 'px-3 py-1.5',
  sectionPadding: 'px-3 py-2',
  tightPadding: 'px-2 py-1',      // For secondary info
  densePadding: 'px-3 py-0.5',    // For inline items
  noGap: 'space-y-0',
  tightGap: 'gap-px', // 1px gap for dividers
};

/**
 * Bloomberg Tooltip (metric explainers)
 *
 * Rule (visual pass P1, 2026-06-12): every metric chip, abbreviation, and
 * estimate marker gets an accessible explainer via the Radix-based
 * MetricTooltip (components/ui/MetricTooltip.tsx) — raw `title=` attrs are
 * invisible on touch and unreachable by keyboard.
 * Native `title` remains acceptable ONLY for truncated-content reveal
 * (e.g. a clipped POV title in a table cell) and icon-button labels.
 */
export const BLOOMBERG_TOOLTIP = {
  content: 'font-mono text-xs max-w-xs leading-relaxed',
  trigger: 'cursor-help',
};

/**
 * Bloomberg Empty State (visual pass P4, 2026-06-12)
 *
 * Rule: a section with no data must SAY so in place. Two anti-patterns this
 * replaces: (1) guard-hidden sections that render a bare header over nothing
 * (or nothing at all — the user can't tell empty from broken), and (2) the
 * generic-SaaS icon-card (h-12 icon + headline + prose). One dense line:
 * what's empty, plus a hint of what would populate it.
 */
export const BLOOMBERG_EMPTY = {
  container: 'px-3 py-4 text-center font-mono',
  message: 'text-xs text-muted-foreground',
  hint: 'text-[10px] text-muted-foreground/70 mt-1',
};

/**
 * Helper function to get status symbol
 */
export function getStatusSymbol(status: string): StatusSymbol {
  return STATUS_SYMBOLS[status] || {
    symbol: '?',
    color: 'text-muted-foreground',
    bg: 'bg-muted/10'
  };
}

/**
 * Helper function to get priority display
 */
export function getPriorityDisplay(priority: string): PriorityDisplay {
  return PRIORITY_DISPLAY[priority] || {
    text: priority,
    color: 'text-muted-foreground'
  };
}

/**
 * Theatre Abbreviations
 * Convert verbose theatre names to Bloomberg-style abbreviations
 */
export const THEATRE_ABBREVIATIONS: Record<string, string> = {
  NORTH_AMERICA: 'NA',
  SOUTH_AMERICA: 'SA',
  EMEA: 'EMEA',
  APAC: 'APAC',
  LATAM: 'LATAM',
  GLOBAL: 'GLB',
};

/**
 * Metric Label Abbreviations
 * Three-letter codes for chart legends and data labels
 *
 * ⚠️ Amended after real-user testing (2026-06-12, visual pass P3): the codes
 * failed in production — users could not decipher HTH/CMP/OVD, and
 * HealthScoreTimeline ships full words ("Health", "Completion", …) instead.
 * Rule: prefer FULL WORDS wherever space allows; use these codes only where
 * space genuinely does not, and then ALWAYS with an accessible explainer
 * (MetricTooltip — see BLOOMBERG_TOOLTIP above). As of 2026-06-12 this
 * constant has zero production consumers; delete if still unused at the
 * next quarterly health-run.
 */
export const METRIC_LABELS: Record<string, string> = {
  health: 'HTH',
  healthScore: 'HTH',
  completion: 'CMP',
  completionRate: 'CMP',
  overdue: 'OVD',
  overduePercent: 'OVD',
  agentSuccess: 'AGT',
  agentSuccessRate: 'AGT',
  revenue: 'REV',
  tasks: 'TSK',
  queue: 'QUE',
  executions: 'EXC',
};

/**
 * Chart Color Palette
 * Consistent RGB colors for charts and data visualization
 */
export const BLOOMBERG_CHART_COLORS = {
  primary: 'rgb(34, 197, 94)',    // Green - health/positive
  secondary: 'rgb(59, 130, 246)', // Blue - completion/neutral
  tertiary: 'rgb(168, 85, 247)',  // Purple - agent/special
  warning: 'rgb(239, 68, 68)',    // Red - overdue/negative
  gridLine: 'rgba(255, 255, 255, 0.1)',
  areaFill: 'rgba(34, 197, 94, 0.1)',
};

/**
 * Helper function to get theatre abbreviation
 */
export function getTheatreAbbreviation(theatre: string): string {
  return THEATRE_ABBREVIATIONS[theatre] || theatre.substring(0, 4).toUpperCase();
}

/**
 * Helper function to get metric abbreviation
 */
export function getMetricLabel(metric: string): string {
  return METRIC_LABELS[metric] || metric.substring(0, 3).toUpperCase();
}

/**
 * Card Variant Styles
 * Consistent card background/border patterns for alerts and status cards
 */
export const BLOOMBERG_VARIANTS = {
  success: 'bg-green-500/10 border-green-500/30',
  warning: 'bg-yellow-500/10 border-yellow-500/30',
  danger: 'bg-red-500/10 border-red-500/30',
  info: 'bg-blue-500/10 border-blue-500/30',
  neutral: 'bg-muted border-border',
};

/**
 * Helper function to get variant styles
 */
export function getVariantStyles(variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'): string {
  return BLOOMBERG_VARIANTS[variant] || BLOOMBERG_VARIANTS.neutral;
}

/**
 * Action Symbol Mapping
 * Symbol-based activity types for dense timeline views
 */
export interface ActionSymbol {
  symbol: string;
  color: string;
  label: string;
}

export const ACTION_SYMBOLS: Record<string, ActionSymbol> = {
  CREATED: { symbol: '+', color: 'text-green-400', label: 'CREATED' },
  COMPLETED: { symbol: '✓', color: 'text-emerald-400', label: 'DONE' },
  UPDATED: { symbol: '~', color: 'text-yellow-400', label: 'UPDATED' },
  ASSIGNED: { symbol: '→', color: 'text-blue-400', label: 'ASSIGNED' },
  UNASSIGNED: { symbol: '←', color: 'text-purple-400', label: 'UNASSIGNED' },
  STATUS_CHANGED: { symbol: '◐', color: 'text-orange-400', label: 'STATUS' },
  PRIORITY_CHANGED: { symbol: '!', color: 'text-red-400', label: 'PRIORITY' },
  COMMENT_ADDED: { symbol: '"', color: 'text-indigo-400', label: 'COMMENT' },
  AGENT_EXECUTED: { symbol: '⚡', color: 'text-cyan-400', label: 'AGENT' },
  DUE_DATE_CHANGED: { symbol: '⏰', color: 'text-amber-400', label: 'DUE DATE' },
  DESCRIPTION_UPDATED: { symbol: '✎', color: 'text-teal-400', label: 'DESC' },
  PHASE_CHANGED: { symbol: '➜', color: 'text-pink-400', label: 'PHASE' },
  STAGE_CHANGED: { symbol: '◈', color: 'text-violet-400', label: 'STAGE' },
  TITLE_UPDATED: { symbol: '✎', color: 'text-teal-400', label: 'TITLE' },
  ATTACHMENT_ADDED: { symbol: '📎', color: 'text-sky-400', label: 'ATTACH' },
  ATTACHMENT_REMOVED: { symbol: '📎', color: 'text-gray-400', label: 'DETACH' },
  // Added 2026-01-05: Missing symbols for enum parity
  REOPENED: { symbol: '↺', color: 'text-amber-400', label: 'REOPENED' },
  WORKFLOW_EXECUTED: { symbol: '⚙', color: 'text-fuchsia-400', label: 'WORKFLOW' },
};

/**
 * Helper function to get action symbol
 */
export function getActionSymbol(action: string): ActionSymbol {
  return ACTION_SYMBOLS[action] || {
    symbol: '•',
    color: 'text-muted-foreground',
    label: action
  };
}
