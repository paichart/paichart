import { authLogger } from '@/lib/logger';

/**
 * GitHub email resolution — shared by the web OAuth path (oauth-service.ts) and
 * the MCP GitHub App path (mcp-oauth-validator.js).
 *
 * GitHub's `GET /user` returns `email: null` for users with a PRIVATE email,
 * regardless of the `user:email` scope. To read the private primary verified
 * address you must call `GET /user/emails`. This is the call both paths were
 * missing — which produced the `${login}@github.user` stub (MCP) and the hard
 * `GITHUB_EMAIL_PRIVATE` reject (web). See
 * cline_docs/findings/2026-06-20-mcp-task-create-false-success.md (oauth follow-up).
 *
 * Requires: the `user:email` OAuth scope (web OAuth App) OR the GitHub App
 * "Email addresses: read" account permission (MCP GitHub App). Without either,
 * `/user/emails` returns 403/404 and this resolves to null (caller rejects).
 *
 * Resolution order:
 *   1. public profile email if already present (cheapest, most common)
 *   2. primary && verified, non-noreply from /user/emails (a real mailbox)
 *   3. any verified non-noreply
 *   4. primary/any noreply (stable GitHub-issued id; isNoReply=true, NOT contactable)
 *   5. null -> caller rejects (no verified email at all)
 *
 * Never throws — returns null on any failure so callers control the reject path.
 */

export interface GitHubEmailResolution {
  email: string;
  /** true => max-privacy `@users.noreply.github.com`; stable id but not mailable */
  isNoReply: boolean;
}

interface GitHubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

const NOREPLY_RE = /@users\.noreply\.github\.com$/i;

export async function resolveGitHubEmail(
  accessToken: string,
  profileEmail: string | null | undefined,
  correlationId?: string,
): Promise<GitHubEmailResolution | null> {
  // 1. Public profile email already present — use it.
  if (profileEmail && typeof profileEmail === 'string') {
    return { email: profileEmail.toLowerCase(), isNoReply: NOREPLY_RE.test(profileEmail) };
  }

  // 2. Private email — query /user/emails.
  let entries: GitHubEmailEntry[];
  try {
    const resp = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'pAIchart-MCP-Hub',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      await resp.body?.cancel(); // BC20: release the TCP connection
      authLogger.warn(
        { correlationId, status: resp.status },
        'GitHub /user/emails non-OK — likely missing user:email scope or GitHub App "Email addresses" permission',
      );
      return null;
    }
    entries = (await resp.json()) as GitHubEmailEntry[];
  } catch (err) {
    authLogger.warn(
      { correlationId, err: err instanceof Error ? err.message : String(err) },
      'GitHub /user/emails fetch failed',
    );
    return null;
  }

  if (!Array.isArray(entries) || entries.length === 0) return null;

  // Guard non-string `email` in every predicate so a malformed entry can't throw
  // out of `.toLowerCase()` below — honors this module's "never throws" contract.
  const isStr = (e: GitHubEmailEntry) => typeof e.email === 'string';

  // 3. Prefer primary & verified & real (deliverable mailbox).
  const realPrimary = entries.find((e) => isStr(e) && e.primary && e.verified && !NOREPLY_RE.test(e.email));
  if (realPrimary) return { email: realPrimary.email.toLowerCase(), isNoReply: false };

  // 4. Any verified real address.
  const realAny = entries.find((e) => isStr(e) && e.verified && !NOREPLY_RE.test(e.email));
  if (realAny) return { email: realAny.email.toLowerCase(), isNoReply: false };

  // 5. noreply — stable GitHub-issued identifier, not contactable. Still far
  //    better than a fabricated `${login}@github.user` stub (real + unique).
  const noreply = entries.find((e) => isStr(e) && e.primary && NOREPLY_RE.test(e.email)) ?? entries.find((e) => isStr(e) && NOREPLY_RE.test(e.email));
  if (noreply) return { email: noreply.email.toLowerCase(), isNoReply: true };

  return null;
}
