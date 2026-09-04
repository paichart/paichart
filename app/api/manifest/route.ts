import { NextResponse } from 'next/server'

export async function GET() {
  const manifest = {
    name: "PoV Manager",
    short_name: "PoVManager",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1976D2",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  }

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
