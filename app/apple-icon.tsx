import { ImageResponse } from 'next/og';

// Generate Apple Touch Icon for iOS home screen
// Higher resolution than standard favicon

export const runtime = 'edge';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', // slate gradient
          borderRadius: '20%', // iOS rounds corners
        }}
      >
        {/* PAIChart pie chart icon optimized for iOS */}
        <svg
          width="140"
          height="140"
          viewBox="0 0 64 64"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform="translate(32, 32)">
            {/* Larger segments for Apple Touch Icon visibility */}
            <circle r={28} fill="#1e293b" stroke="#334155" strokeWidth="2" />

            {/* 8 colorful segments */}
            <path d="M 0 0 L 0 -28 A 28 28 0 0 1 19.8 -19.8 Z" fill="#f472b6" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L 19.8 -19.8 A 28 28 0 0 1 28 0 Z" fill="#ec4899" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L 28 0 A 28 28 0 0 1 19.8 19.8 Z" fill="#f87171" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L 19.8 19.8 A 28 28 0 0 1 0 28 Z" fill="#fb923c" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L 0 28 A 28 28 0 0 1 -19.8 19.8 Z" fill="#fbbf24" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L -19.8 19.8 A 28 28 0 0 1 -28 0 Z" fill="#34d399" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L -28 0 A 28 28 0 0 1 -19.8 -19.8 Z" fill="#2dd4bf" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M 0 0 L -19.8 -19.8 A 28 28 0 0 1 0 -28 Z" fill="#60a5fa" stroke="#1e293b" strokeWidth="1.5" />
          </g>
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
