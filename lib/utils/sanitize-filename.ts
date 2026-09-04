/**
 * Sanitize a filename for use in Content-Disposition headers.
 *
 * Prevents CRLF header injection (BC22) by stripping control characters,
 * escaping double quotes, and enforcing a length limit.
 *
 * @param name - Raw filename (may come from user input or database)
 * @param fallback - Fallback filename if sanitized result is empty
 * @returns Safe filename string for use in Content-Disposition
 */
export function sanitizeFilename(name: string | null | undefined, fallback = 'download'): string {
  if (!name || typeof name !== 'string') return fallback;

  const sanitized = name
    // Strip control characters (CR, LF, NUL, tabs, etc.)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Strip/escape double quotes (break out of filename="...")
    .replace(/"/g, "'")
    // Strip backslashes (escape sequences)
    .replace(/\\/g, '_')
    // Limit to 255 chars (filesystem limit)
    .slice(0, 255)
    .trim();

  return sanitized || fallback;
}

/**
 * Build a safe Content-Disposition header value.
 *
 * Uses RFC 6266 format with ASCII-only filename parameter.
 * Non-ASCII characters are replaced with underscores.
 *
 * @param name - Raw filename
 * @param fallback - Fallback filename
 * @returns Complete Content-Disposition header value
 */
export function safeContentDisposition(name: string | null | undefined, fallback = 'download'): string {
  const safe = sanitizeFilename(name, fallback);
  // Replace any remaining non-ASCII with underscore for maximum compatibility
  const asciiSafe = safe.replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${asciiSafe}"`;
}
