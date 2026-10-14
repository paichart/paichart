#!/usr/bin/env python3
"""PLATFORM-HELD-BYTES — generator for scripts/fixtures/held-bytes/decode-vectors.json (Stage A WI-2, panel BC-A3).

Run with isolation, from the repo root:   python3 -I scripts/fixtures/held-bytes/gen-legacy-python-text.py

It is the ONE source of the vector file. Never hand-edit decode-vectors.json; edit VECTORS below and re-run.

For each raw input it records two decodes:
  1. the OPERATOR decode, paichart.text/1 (P3-SERVICE-CONTRACT.md §3.1) — a Python reference implementation, the seed of
     Stage C's operator tool; the TypeScript `decodeCanonicalBytes` must agree with it byte for byte;
  2. the LEGACY read the rig's services do today — Python text mode, `open(p, "r", encoding="utf-8")`, i.e. universal
     newlines and the BOM kept (obs-mcp-readonly/server.py) — reproduced as
     io.TextIOWrapper(io.BytesIO(raw), encoding="utf-8", newline=None).read().

and one class per vector, which the TypeScript test asserts (BC-A3):
  legacy-equal                      the platform's legacy path holds exactly the operator's canonical text
  legacy-refused                    the platform's legacy checks refuse the service's text (named refusal)
  legacy-service-error              the service's own read fails (strict UTF-8), so no text ever reaches the platform
  legacy-accepts-operator-refuses   Python silently turns a lone CR into LF: the legacy path accepts a file the operator
                                    refuses — the named, accepted cost of P3 §6.2
"""
import base64
import hashlib
import io
import json
import os
import sys

# id, case, raw bytes. V19-V21 carry secret-shaped tokens and are built at RUNTIME by the TypeScript test (gitleaks
# discipline), never written here.
VECTORS = [
    ("V1", "LF", b"a\nb\n"),
    ("V2", "CRLF", b"a\r\nb\r\n"),
    ("V3", "mixed", b"a\r\nb\n"),
    ("V4", "BOM + LF", b"\xef\xbb\xbfa\nb\n"),
    ("V5", "no final newline", b"a\nb"),
    ("V6", "empty", b""),
    ("V7", "lone CR mid-line", b"a\rb\n"),
    ("V8", "CR at EOF", b"a\nb\r"),
    ("V9", "invalid UTF-8 (Latin-1 e-acute)", b"caf\xe9\n"),
    ("V10", "encoded surrogate", b"a\xed\xa0\x80\n"),
    ("V11", "overlong", b"\xc0\xaf\n"),
    ("V12", "NUL", b"a\x00b\n"),
    ("V13", "double BOM", b"\xef\xbb\xbf\xef\xbb\xbfa\n"),
    ("V14", "U+2028 + FF inside a line", b"a\xe2\x80\xa8b\x0cc\n"),
    ("V15", "NBSP + ellipsis (no NFKC)", b"x\xc2\xa0\xe2\x80\xa6\n"),
    ("V16", "trailing space + tab, blank last line", b"a \t\n\n"),
    ("V17", "BOM + CRLF, no final newline", b"\xef\xbb\xbfa\r\nb"),
    ("V18", "NUL and invalid UTF-8", b"\xff\x00\n"),
]


def count_lines(text):
    if text == "":
        return 0
    parts = len(text.split("\n"))
    return parts - 1 if text.endswith("\n") else parts


def operator_decode(raw):
    """paichart.text/1 (P3 §3.1), steps in order. Returns ("ok", text, facts) or ("refuse", name, offset)."""
    bom = raw[:3] == b"\xef\xbb\xbf"
    body = raw[3:] if bom else raw
    if b"\x00" in body:
        return ("refuse", "nul-byte", body.index(b"\x00") + (3 if bom else 0))
    try:
        c0 = body.decode("utf-8", "strict")
    except UnicodeDecodeError as e:
        return ("refuse", "invalid-utf8", e.start + (3 if bom else 0))
    for i, ch in enumerate(c0):
        if ch == "\r" and (i + 1 >= len(c0) or c0[i + 1] != "\n"):
            return ("refuse", "lone-cr", i)
    crlf = c0.count("\r\n")
    lf_total = c0.count("\n")
    lone_lf = lf_total - crlf
    newline = "none" if lf_total == 0 else ("crlf" if lone_lf == 0 else ("lf" if crlf == 0 else "mixed"))
    text = c0.replace("\r\n", "\n")
    facts = {
        "newline": newline,
        "crlfCount": crlf,
        "bom": bom,
        "finalNewline": text.endswith("\n"),
        "lineCount": count_lines(text),
        "byteLength": len(raw),
    }
    return ("ok", text, facts)


def legacy_read(raw):
    """What the rig's Python service returns today: text mode, universal newlines, BOM kept."""
    try:
        return ("ok", io.TextIOWrapper(io.BytesIO(raw), encoding="utf-8", newline=None).read())
    except UnicodeDecodeError:
        return ("error", None)


def legacy_platform_check(s):
    """The platform's checkLegacyText precedence (canonical-text.ts), mirrored."""
    if "\x00" in s:
        return "nul-byte"
    try:
        s.encode("utf-8", "strict")
    except UnicodeEncodeError:
        return "lone-surrogate"
    if "\r" in s:
        return "decode-violated"
    if s.startswith("﻿"):
        return "legacy-bom"
    return None


def b64(b):
    return base64.b64encode(b).decode("ascii")


def main():
    out = []
    for vid, case, raw in VECTORS:
        entry = {"id": vid, "case": case, "rawB64": b64(raw)}
        op = operator_decode(raw)
        if op[0] == "ok":
            entry["operator"] = {
                "result": "ok",
                "textB64": b64(op[1].encode("utf-8")),
                "facts": op[2],
                "textSha256TestOnly": hashlib.sha256(op[1].encode("utf-8")).hexdigest(),
            }
        else:
            entry["operator"] = {"result": "refuse", "refusal": op[1], "offset": op[2]}
        lg = legacy_read(raw)
        if lg[0] == "error":
            entry["legacyPythonText"] = None
            entry["legacyClass"] = "legacy-service-error"
        else:
            text = lg[1]
            entry["legacyPythonText"] = {"textB64": b64(text.encode("utf-8", "surrogatepass"))}
            refusal = legacy_platform_check(text)
            if refusal is not None:
                entry["legacyClass"] = "legacy-refused"
                entry["legacyRefusal"] = refusal
            elif op[0] == "refuse":
                entry["legacyClass"] = "legacy-accepts-operator-refuses"
            elif text == op[1]:
                entry["legacyClass"] = "legacy-equal"
            else:
                sys.exit(f"{vid}: legacy text differs from the operator text and no class covers it — add one")
        out.append(entry)
    doc = {
        "_comment": (
            "GENERATED by scripts/fixtures/held-bytes/gen-legacy-python-text.py (python3 -I). Never hand-edit. "
            "textSha256TestOnly is sha256(C) and must never appear in a contract field (P3 §2.2). Offsets are "
            "diagnostic: nul-byte/invalid-utf8 count bytes in raw, lone-cr counts characters in the decoded text; the "
            "TypeScript decoder gives no invalid-utf8 offset, so the test asserts that refusal by NAME only (P3 §3.4)."
        ),
        "decodeVersion": "paichart.text/1",
        "vectors": out,
    }
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "decode-vectors.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2, ensure_ascii=True)
        f.write("\n")
    print(f"wrote {path}: {len(out)} vectors")


if __name__ == "__main__":
    main()
