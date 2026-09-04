import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { safeContentDisposition } from '@/lib/utils/sanitize-filename';

const ALLOWED_FILES: Record<string, string> = {
  'getting_started.md': 'Getting Started',
  'security_policy.md': 'Security Policy',
  'architecture_sanitized.md': 'Architecture Overview',
  'paichart_features.md': 'pAIchart Features',
  'trust_levels.md': 'Trust Levels',
  'validation_showcase.md': 'Validation Showcase',
  'external_service_auth.md': 'External Service Authentication',
  'workflow_guide.md': 'Workflow Guide',
  'register_guide.md': 'Registration Guide',
};

// SECURITY DECISION (2026-02-19): Auth required.
// Files include internal docs (security_policy, architecture, trust_levels,
// external_service_auth) not appropriate for unauthenticated callers.
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

  const filePath = path.join(process.cwd(), '.claude', 'knowledge', 'domain', 'mcp', 'prompts', filename);

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
