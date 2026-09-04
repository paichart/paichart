/**
 * PAIChart Logo Components
 *
 * Full logo with pie chart icon + text
 * Icon-only version for compact spaces
 *
 * Usage:
 *   <PAIChartLogo className="w-64 h-auto" />
 *   <PAIChartIcon className="w-12 h-12" />
 */

import * as React from "react";

/**
 * Full pAIchart logo with pie chart icon and text
 */
export function PAIChartLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 260 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="paichart-title paichart-desc"
      {...props}
    >
      <title id="paichart-title">pAIchart logo</title>
      <desc id="paichart-desc">
        Logo for pAIchart with an 8-segment pie chart icon
      </desc>

      <defs>
        <linearGradient
          id="paichart-ai-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>

      {/* Pie chart icon */}
      <g transform="translate(32, 32)">
        <circle r={20} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={1.5} />

        <path
          d="M 0 0 L 0 -20 A 20 20 0 0 1 14.14 -14.14 Z"
          fill="#ec4899"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 14.14 -14.14 A 20 20 0 0 1 20 0 Z"
          fill="#db2777"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 20 0 A 20 20 0 0 1 14.14 14.14 Z"
          fill="#ef4444"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 14.14 14.14 A 20 20 0 0 1 0 20 Z"
          fill="#f97316"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 0 20 A 20 20 0 0 1 -14.14 14.14 Z"
          fill="#eab308"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L -14.14 14.14 A 20 20 0 0 1 -20 0 Z"
          fill="#22c55e"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L -20 0 A 20 20 0 0 1 -14.14 -14.14 Z"
          fill="#14b8a6"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L -14.14 -14.14 A 20 20 0 0 1 0 -20 Z"
          fill="#3b82f6"
          stroke="#f9fafb"
          strokeWidth={1.5}
        />
      </g>

      {/* Text: pAIchart, 30% larger text */}
      <text
        x={70}
        y={40}
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        fontSize={34}
        fontWeight={600}
        letterSpacing="0.01em"
      >
        <tspan fill="#e5e7eb">p</tspan>
        <tspan fill="url(#paichart-ai-gradient)">AI</tspan>
        <tspan fill="#e5e7eb">chart</tspan>
      </text>
    </svg>
  );
}

/**
 * Icon-only version - just the 8-segment pie chart
 * Perfect for favicons, app icons, compact headers, user avatars
 */
export function PAIChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="paichart-icon-title"
      {...props}
    >
      <title id="paichart-icon-title">pAIchart icon</title>

      {/* Pie chart with 8 colored segments */}
      <g transform="translate(32, 32)">
        <circle r={28} fill="#f9fafb" stroke="#e5e7eb" strokeWidth={2} />

        {/* Segment 1: Pink (top) */}
        <path
          d="M 0 0 L 0 -28 A 28 28 0 0 1 19.8 -19.8 Z"
          fill="#ec4899"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 2: Darker Pink (top-right) */}
        <path
          d="M 0 0 L 19.8 -19.8 A 28 28 0 0 1 28 0 Z"
          fill="#db2777"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 3: Red (right) */}
        <path
          d="M 0 0 L 28 0 A 28 28 0 0 1 19.8 19.8 Z"
          fill="#ef4444"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 4: Orange (bottom-right) */}
        <path
          d="M 0 0 L 19.8 19.8 A 28 28 0 0 1 0 28 Z"
          fill="#f97316"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 5: Yellow (bottom) */}
        <path
          d="M 0 0 L 0 28 A 28 28 0 0 1 -19.8 19.8 Z"
          fill="#eab308"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 6: Green (bottom-left) */}
        <path
          d="M 0 0 L -19.8 19.8 A 28 28 0 0 1 -28 0 Z"
          fill="#22c55e"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 7: Teal (left) */}
        <path
          d="M 0 0 L -28 0 A 28 28 0 0 1 -19.8 -19.8 Z"
          fill="#14b8a6"
          stroke="#f9fafb"
          strokeWidth={2}
        />
        {/* Segment 8: Blue (top-left) */}
        <path
          d="M 0 0 L -19.8 -19.8 A 28 28 0 0 1 0 -28 Z"
          fill="#3b82f6"
          stroke="#f9fafb"
          strokeWidth={2}
        />
      </g>
    </svg>
  );
}

/**
 * Dark theme variant - optimized for dark backgrounds
 * Darker colors with better contrast on dark surfaces
 */
export function PAIChartLogoDark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 260 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="paichart-dark-title"
      {...props}
    >
      <title id="paichart-dark-title">pAIchart logo (dark theme)</title>

      <defs>
        <linearGradient
          id="paichart-ai-gradient-dark"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      {/* Pie chart icon */}
      <g transform="translate(32, 32)">
        <circle r={20} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />

        <path
          d="M 0 0 L 0 -20 A 20 20 0 0 1 14.14 -14.14 Z"
          fill="#f472b6"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 14.14 -14.14 A 20 20 0 0 1 20 0 Z"
          fill="#ec4899"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 20 0 A 20 20 0 0 1 14.14 14.14 Z"
          fill="#f87171"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 14.14 14.14 A 20 20 0 0 1 0 20 Z"
          fill="#fb923c"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L 0 20 A 20 20 0 0 1 -14.14 14.14 Z"
          fill="#fbbf24"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L -14.14 14.14 A 20 20 0 0 1 -20 0 Z"
          fill="#34d399"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L -20 0 A 20 20 0 0 1 -14.14 -14.14 Z"
          fill="#2dd4bf"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
        <path
          d="M 0 0 L -14.14 -14.14 A 20 20 0 0 1 0 -20 Z"
          fill="#60a5fa"
          stroke="#1e293b"
          strokeWidth={1.5}
        />
      </g>

      {/* Text: pAIchart, 30% larger text */}
      <text
        x={70}
        y={40}
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        fontSize={34}
        fontWeight={600}
        letterSpacing="0.01em"
      >
        <tspan fill="#f1f5f9">p</tspan>
        <tspan fill="url(#paichart-ai-gradient-dark)">AI</tspan>
        <tspan fill="#f1f5f9">chart</tspan>
      </text>
    </svg>
  );
}

/**
 * Icon-only dark theme variant
 */
export function PAIChartIconDark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="paichart-icon-dark-title"
      {...props}
    >
      <title id="paichart-icon-dark-title">pAIchart icon (dark theme)</title>

      <g transform="translate(32, 32)">
        <circle r={28} fill="#1e293b" stroke="#334155" strokeWidth={2} />

        <path
          d="M 0 0 L 0 -28 A 28 28 0 0 1 19.8 -19.8 Z"
          fill="#f472b6"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L 19.8 -19.8 A 28 28 0 0 1 28 0 Z"
          fill="#ec4899"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L 28 0 A 28 28 0 0 1 19.8 19.8 Z"
          fill="#f87171"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L 19.8 19.8 A 28 28 0 0 1 0 28 Z"
          fill="#fb923c"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L 0 28 A 28 28 0 0 1 -19.8 19.8 Z"
          fill="#fbbf24"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L -19.8 19.8 A 28 28 0 0 1 -28 0 Z"
          fill="#34d399"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L -28 0 A 28 28 0 0 1 -19.8 -19.8 Z"
          fill="#2dd4bf"
          stroke="#1e293b"
          strokeWidth={2}
        />
        <path
          d="M 0 0 L -19.8 -19.8 A 28 28 0 0 1 0 -28 Z"
          fill="#60a5fa"
          stroke="#1e293b"
          strokeWidth={2}
        />
      </g>
    </svg>
  );
}

/**
 * PAPER / LIGHT-BACKGROUND full logo. ⭐ Added 2026-08-07
 *
 * USE THIS ON WHITE, CREAM OR PAPER. Neither `PAIChartLogo` nor `PAIChartLogoDark`
 * works on a light surface — despite the naming, BOTH set a near-white wordmark
 * (#e5e7eb and #f1f5f9). Measured against #ffffff, #e5e7eb is 1.24:1 contrast,
 * where WCAG asks 3.0:1 for large text. "Light theme" in the older names means
 * light-COLOURED logo, not "for light backgrounds".
 *
 * The eight segment colours and the AI gradient are the brand's light palette
 * verbatim; only the neutrals change (separators to paper, ring to a warm line
 * grey, wordmark to ink).
 *
 * Standalone SVG twin: .claude/knowledge/branding/paichart-logo-paper.svg
 */
export function PAIChartLogoPaper(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 260 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="paichart-paper-title paichart-paper-desc"
      {...props}
    >
      <title id="paichart-paper-title">pAIchart logo</title>
      <desc id="paichart-paper-desc">
        Logo for pAIchart with an 8-segment pie chart icon, for light backgrounds
      </desc>
      <defs>
        <linearGradient id="paichart-ai-gradient-paper" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <circle cx={32} cy={32} r={30} fill="#f7f5ef" stroke="#d2ccbc" strokeWidth={1.5} />
      <path d="M32,32 L20.902,5.207 A29,29 0 0 1 43.098,5.207 Z" fill="#ec4899" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L43.098,5.207 A29,29 0 0 1 58.793,20.902 Z" fill="#db2777" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L58.793,20.902 A29,29 0 0 1 58.793,43.098 Z" fill="#ef4444" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L58.793,43.098 A29,29 0 0 1 43.098,58.793 Z" fill="#f97316" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L43.098,58.793 A29,29 0 0 1 20.902,58.793 Z" fill="#eab308" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L20.902,58.793 A29,29 0 0 1 5.207,43.098 Z" fill="#22c55e" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L5.207,43.098 A29,29 0 0 1 5.207,20.902 Z" fill="#14b8a6" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L5.207,20.902 A29,29 0 0 1 20.902,5.207 Z" fill="#3b82f6" stroke="#f7f5ef" strokeWidth={2} />
      <text
        x={74}
        y={42}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={30}
        fontWeight={700}
        letterSpacing="-0.5"
      >
        <tspan fill="#14130f">p</tspan>
        <tspan fill="url(#paichart-ai-gradient-paper)">AI</tspan>
        <tspan fill="#14130f">chart</tspan>
      </text>
    </svg>
  );
}

/**
 * PAPER / LIGHT-BACKGROUND icon only. ⭐ Added 2026-08-07
 * Separator stroke is 2 rather than 1.5, per the library's icon-size guidance.
 * Standalone SVG twin: .claude/knowledge/branding/paichart-icon-paper.svg
 */
export function PAIChartIconPaper(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="pAIchart icon"
      {...props}
    >
      <circle cx={32} cy={32} r={30} fill="#f7f5ef" stroke="#d2ccbc" strokeWidth={1.5} />
      <path d="M32,32 L20.902,5.207 A29,29 0 0 1 43.098,5.207 Z" fill="#ec4899" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L43.098,5.207 A29,29 0 0 1 58.793,20.902 Z" fill="#db2777" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L58.793,20.902 A29,29 0 0 1 58.793,43.098 Z" fill="#ef4444" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L58.793,43.098 A29,29 0 0 1 43.098,58.793 Z" fill="#f97316" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L43.098,58.793 A29,29 0 0 1 20.902,58.793 Z" fill="#eab308" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L20.902,58.793 A29,29 0 0 1 5.207,43.098 Z" fill="#22c55e" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L5.207,43.098 A29,29 0 0 1 5.207,20.902 Z" fill="#14b8a6" stroke="#f7f5ef" strokeWidth={2} />
      <path d="M32,32 L5.207,20.902 A29,29 0 0 1 20.902,5.207 Z" fill="#3b82f6" stroke="#f7f5ef" strokeWidth={2} />
    </svg>
  );
}

/**
 * THEME-AWARE full logo. ⭐ Added 2026-08-07 — PREFER THIS AT EVERY CALL SITE.
 *
 * Renders the paper variant on light themes and the dark variant on BOTH dark
 * themes (.dark and .dusk), via plain CSS in globals.css. No hook, no
 * client boundary, no hydration flash — the hidden one is `display:none`, so it is
 * also out of the accessibility tree.
 *
 * WHY IT EXISTS: picking a variant by hand is the trap this library kept setting.
 * Three call sites shipped a near-white wordmark onto a white background because
 * `PAIChartLogo` reads as "the light-theme one" and is in fact light-COLOURED.
 * With this component the choice cannot be got wrong.
 */
export function PAIChartLogoAuto({ className = "", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <>
      <PAIChartLogoPaper className={`${className} brand-on-light`} {...props} />
      <PAIChartLogoDark className={`${className} brand-on-dark`} {...props} />
    </>
  );
}

/** THEME-AWARE icon. Same rationale as PAIChartLogoAuto. */
export function PAIChartIconAuto({ className = "", ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <>
      <PAIChartIconPaper className={`${className} brand-on-light`} {...props} />
      <PAIChartIconDark className={`${className} brand-on-dark`} {...props} />
    </>
  );
}
