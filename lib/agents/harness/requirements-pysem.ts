/**
 * Python-semantics primitives for the requirements form-check port (2026-10-09).
 *
 * The requirements checks were written in Python (scripts/check-requirements-*.py, ~/paichart/scripts/requirements-rules.py)
 * and the TypeScript port must return IDENTICAL findings (scripts/test-requirements-form-check-parity.ts is the gate).
 * Python and JavaScript disagree in exactly the places a line-by-line port would silently miss:
 *
 *   - `\w`, `\d`, `\s`, `\b` are UNICODE-aware in Python 3 `str` patterns and ASCII in JS (even with the `u` flag);
 *   - `.` excludes only `\n` in Python, and `\n`, `\r`, U+2028, U+2029 in JS;
 *   - `^`/`$` under re.M break only at `\n` in Python, at four terminators in JS; non-M `$` also matches before a
 *     final `\n` in Python;
 *   - `str.split()` / `str.strip()` use Python's whitespace set (incl. U+001C–U+001F, U+0085; excl. U+FEFF);
 *   - `len()` and slicing count CODE POINTS, JS `.length` counts UTF-16 units;
 *   - `json.dumps` escapes every non-ASCII character (ensure_ascii) — the delivered-size estimate depends on it,
 *     and it was verified against Run 14's measured 67,093 on 2026-10-09 (do NOT swap in JSON.stringify).
 *
 * `pyRe` translates a Python pattern into a JS RegExp with Python's meaning for each of these. PURE; no I/O.
 */

/** Python's `str.isspace()` set — what `\s`, `split()` and `strip()` use on `str`. */
export const PY_WS_CLASS = '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const W_CLASS = '\\p{L}\\p{N}_';
const WS_RUN = new RegExp(`[${PY_WS_CLASS}]+`, 'u');
const WS_ONE = new RegExp(`[${PY_WS_CLASS}]`, 'u');

/** `s.split()` with no argument. */
export function pySplit(s: string): string[] {
  return s.split(new RegExp(WS_RUN.source, 'gu')).filter(x => x !== '');
}

/** `s.strip()` / `s.strip(chars)`; `lstrip` / `rstrip` likewise. Chars are compared by code point. */
export function pyStrip(s: string, chars?: string): string { return pyRstrip(pyLstrip(s, chars), chars); }
export function pyLstrip(s: string, chars?: string): string {
  const cps = Array.from(s);
  let i = 0;
  while (i < cps.length && isStripChar(cps[i], chars)) i++;
  return cps.slice(i).join('');
}
export function pyRstrip(s: string, chars?: string): string {
  const cps = Array.from(s);
  let j = cps.length;
  while (j > 0 && isStripChar(cps[j - 1], chars)) j--;
  return cps.slice(0, j).join('');
}
function isStripChar(cp: string, chars?: string): boolean {
  return chars === undefined ? WS_ONE.test(cp) : Array.from(chars).includes(cp);
}

/** `len(s)` — code points. */
export function cpLen(s: string): number {
  let n = 0;
  const it = s[Symbol.iterator]();
  while (!it.next().done) n++;
  return n;
}

/** `s[:n]` — code points. */
export function cpSlice(s: string, n: number): string {
  if (s.length <= n) return s; // every unit is at most one code point
  return Array.from(s).slice(0, n).join('');
}

/** `json.dumps(s)` with Python's defaults (ensure_ascii=True). The output is pure ASCII. */
export function pyJsonDumpsStr(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0d) out += '\\r';
    else if (c === 0x09) out += '\\t';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x0c) out += '\\f';
    // ESCAPE_ASCII = ([\\"]|[^\ -~]); a UTF-16 unit IS the surrogate half Python emits for an astral char.
    else if (c < 0x20 || c > 0x7e) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += s[i];
  }
  return out + '"';
}

/** `f'{n:,}'` */
export function pyCommas(n: number): string {
  const neg = n < 0;
  const digits = String(Math.abs(Math.trunc(n)));
  return (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Python's `str.isprintable()` is false for these categories (space excepted). */
const NON_PRINTABLE = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u;

/** `repr(s)` for a str (quote choice, backslash, \n \r \t, and \x / \u / \U for every non-printable code point). */
export function pyRepr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\') out += '\\\\';
    else if (ch === q) out += '\\' + q;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch !== ' ' && NON_PRINTABLE.test(ch)) {
      out += c < 0x100 ? '\\x' + c.toString(16).padStart(2, '0') : c < 0x10000 ? '\\u' + c.toString(16).padStart(4, '0') : '\\U' + c.toString(16).padStart(8, '0');
    } else out += ch;
  }
  return out + q;
}

/** `str.ljust(n)` by code points (`f'{x:<n}'`). */
export function pyLjust(s: string, n: number): string {
  const l = cpLen(s);
  return l >= n ? s : s + ' '.repeat(n - l);
}
/** `f'{x:>n}'` by code points. */
export function pyRjust(s: string, n: number): string {
  const l = cpLen(s);
  return l >= n ? s : ' '.repeat(n - l) + s;
}

const SYNTAX = new Set('^$\\.*+?()[]{}|/'.split(''));
const W_BOUNDARY = `(?:(?<=[${W_CLASS}])(?![${W_CLASS}])|(?<![${W_CLASS}])(?=[${W_CLASS}]))`;
const NOT_W_BOUNDARY = `(?:(?<=[${W_CLASS}])(?=[${W_CLASS}])|(?<![${W_CLASS}])(?![${W_CLASS}]))`;

export interface PyFlags { i?: boolean; m?: boolean; s?: boolean }

/** Every Python pattern this port compiles, as written (+ flags). The parity test replays each one through Python's
 *  `re` over adversarial text (Unicode letters/digits beside tokens, NBSP, U+001C, U+2028, CR, astral chars) — the
 *  corpus alone does not exercise those semantics (measured: an ASCII `\b` passed all 103 corpus cases). */
export const PY_PATTERN_LOG = new Map<string, { pattern: string; flags: PyFlags }>();

/**
 * Translate a Python `re` pattern (inline `(?ims)` flags at the very start allowed) into a JS RegExp with the same
 * meaning. `extraJsFlags` adds e.g. 'g'. Throws on a construct it does not know, rather than guessing.
 */
export function pyRe(pattern: string, flags: PyFlags = {}, extraJsFlags = ''): RegExp {
  const logKey = JSON.stringify([pattern, !!flags.i, !!flags.m, !!flags.s]);
  if (!PY_PATTERN_LOG.has(logKey) && PY_PATTERN_LOG.size < 500) PY_PATTERN_LOG.set(logKey, { pattern, flags: { ...flags } });
  let src = pattern;
  const f: PyFlags = { ...flags };
  const inline = /^\(\?([aiLmsux]+)\)/.exec(src);
  if (inline) {
    for (const c of inline[1]) {
      if (c === 'i') f.i = true;
      else if (c === 'm') f.m = true;
      else if (c === 's') f.s = true;
      else throw new Error(`pyRe: unsupported inline flag ${c}`);
    }
    src = src.slice(inline[0].length);
  }
  let out = '';
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      const nx = src[i + 1];
      if (nx === undefined) throw new Error('pyRe: trailing backslash');
      i++;
      if (inClass) {
        if (nx === 'w') out += W_CLASS;
        else if (nx === 'b') out += '\\x08'; // backspace inside a class, in Python as in JS
        else if (nx === 'd') out += '\\p{Nd}';
        else if (nx === 's') out += PY_WS_CLASS;
        else if ('WDS'.includes(nx)) throw new Error(`pyRe: \\${nx} inside a class is not supported`);
        else if (/[ntrfvx0-9u]/.test(nx)) out += '\\' + nx;
        else if (SYNTAX.has(nx) || nx === '-') out += '\\' + nx;
        else out += nx; // Python identity escape of a non-syntax char (e.g. \' ) — literal
      } else {
        if (nx === 'w') out += `[${W_CLASS}]`;
        else if (nx === 'W') out += `[^${W_CLASS}]`;
        else if (nx === 'd') out += '\\p{Nd}';
        else if (nx === 'D') out += '\\P{Nd}';
        else if (nx === 's') out += `[${PY_WS_CLASS}]`;
        else if (nx === 'S') out += `[^${PY_WS_CLASS}]`;
        else if (nx === 'b') out += W_BOUNDARY;
        else if (nx === 'B') out += NOT_W_BOUNDARY;
        else if (nx === 'Z') out += '(?![^])';
        else if (nx === 'A') out += '(?<![^])';
        else if (/[ntrfvx0-9u]/.test(nx)) out += '\\' + nx;
        else if (SYNTAX.has(nx)) out += '\\' + nx;
        else out += nx;
      }
      continue;
    }
    if (inClass) {
      if (ch === ']') inClass = false;
      out += ch;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      out += ch;
      // a leading ']' or '^]' is literal in Python
      if (src[i + 1] === '^') { out += '^'; i++; }
      if (src[i + 1] === ']') { out += '\\]'; i++; }
      continue;
    }
    if (ch === '.') { out += f.s ? '[^]' : '[^\\n]'; continue; }
    if (ch === '^') { out += f.m ? '(?<![^\\n])' : '(?<![^])'; continue; }
    if (ch === '$') { out += f.m ? '(?![^\\n])' : '(?=\\n?(?![^]))'; continue; }
    out += ch;
  }
  return new RegExp(out, 'u' + (f.i ? 'i' : '') + extraJsFlags);
}

/** `re.match` — anchored at the start, not the end. */
export function pyMatch(re: RegExp, s: string): RegExpExecArray | null {
  const sticky = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'y');
  sticky.lastIndex = 0;
  return sticky.exec(s);
}

/** `re.search` */
export function pySearch(re: RegExp, s: string): RegExpExecArray | null {
  return new RegExp(re.source, re.flags.replace(/[gy]/g, '')).exec(s);
}

/** `re.finditer` */
export function pyFinditer(re: RegExp, s: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'g');
  return Array.from(s.matchAll(g)) as RegExpExecArray[];
}

/** Escape a literal for use inside a pyRe pattern (the `re.escape` role; `-` left bare — illegal escaped in `u` mode). */
export function reEscape(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

/** Python `str.find(sub, start)` — negative start counts from the end, like a slice. */
export function pyFind(s: string, sub: string, start = 0): number {
  const st = start < 0 ? Math.max(0, s.length + start) : start;
  return s.indexOf(sub, st);
}

/** Python slice `s[a:b]` with negative indices (UTF-16 indices; callers use indices obtained from JS searches). */
export function pySlice(s: string, a: number, b?: number): string {
  return s.slice(a, b);
}
