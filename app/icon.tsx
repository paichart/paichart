import { ImageResponse } from 'next/og';

// Generate favicon dynamically from PAIChartIcon
// Next.js will call this to generate favicon.ico at build time

export const runtime = 'edge';

export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a', // slate-950
        }}
      >
        {/* Simplified pie chart icon for favicon */}
        <svg
          width="28"
          height="28"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform="translate(32, 32)">
            <circle r={28} fill="#1e293b" />

            {/* 8 segments */}
            <path d="M 0 0 L 0 -28 A 28 28 0 0 1 19.8 -19.8 Z" fill="#ec4899" />
            <path d="M 0 0 L 19.8 -19.8 A 28 28 0 0 1 28 0 Z" fill="#db2777" />
            <path d="M 0 0 L 28 0 A 28 28 0 0 1 19.8 19.8 Z" fill="#ef4444" />
            <path d="M 0 0 L 19.8 19.8 A 28 28 0 0 1 0 28 Z" fill="#f97316" />
            <path d="M 0 0 L 0 28 A 28 28 0 0 1 -19.8 19.8 Z" fill="#eab308" />
            <path d="M 0 0 L -19.8 19.8 A 28 28 0 0 1 -28 0 Z" fill="#22c55e" />
            <path d="M 0 0 L -28 0 A 28 28 0 0 1 -19.8 -19.8 Z" fill="#14b8a6" />
            <path d="M 0 0 L -19.8 -19.8 A 28 28 0 0 1 0 -28 Z" fill="#3b82f6" />
          </g>
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
