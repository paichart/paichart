import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { safeContentDisposition } from '@/lib/utils/sanitize-filename';

// 2026-11-13 (owner: the old list was stale — nine snapshots of hub prompts under names the hub no longer uses): the page now
// serves the current user documents from `docs/`. The allowlist is still the only thing that decides what can be read: a name
// not listed here is a 404, whatever else sits in `docs/`. Keep it in step with KNOWLEDGE_BASE_DOCS in the support page.
const ALLOWED_FILES: Record<string, string> = {
  'READING-A-RUN.md': 'Reading a run',
  'TROUBLESHOOTING-A-RUN.md': 'Troubleshooting a run',
  'OPERATING.md': 'Operating: running a program',
  'WRITING-A-SPEC.md': 'Writing a spec',
  'FIRST-RUN.md': 'Your first run',
  'GLOSSARY.md': 'Glossary',
};

// SECURITY DECISION (2026-02-19): Auth required. (The documents served since 2026-11-13 are public ones; the requirement stays —
// it costs a signed-in visitor nothing and keeps the route's behaviour unchanged.)
// Path traversal already prevented by ALLOWED_FILES allowlist above.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { filename } = await params;

  if (!ALLOWED_FILES[filename]) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), 'docs', filename);

  try {
    const content = await readFile(filePath, 'utf-8');

    // BC22 FIX: Sanitize filename for defense-in-depth (allowlist already prevents injection)
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': safeContentDisposition(filename, 'document.md'),
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
