/**
 * copyToClipboard — works on plain-http self-hosts too.
 *
 * `navigator.clipboard` exists only in a SECURE CONTEXT (https, or localhost). A self-hosted install reached at
 * `http://192.168.x.x:3000` has no `navigator.clipboard` at all, so every copy button failed with
 * "Failed to copy to clipboard" (E17, devext clean-slate replay 2026-09-08 — the API-key copy icon, the one a
 * new user presses first). Fallback: a temporary off-screen textarea + `document.execCommand('copy')`, which
 * browsers still honour for user-gesture copies on insecure origins. Throws if both paths fail so callers keep
 * their existing error toasts.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to the legacy path (permissions denied, or a browser that exposes the API but refuses)
    }
  }
  if (typeof document === 'undefined') throw new Error('Clipboard unavailable: no document');
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    document.body.removeChild(ta);
  }
  if (!ok) throw new Error('Clipboard unavailable: execCommand("copy") returned false');
}
