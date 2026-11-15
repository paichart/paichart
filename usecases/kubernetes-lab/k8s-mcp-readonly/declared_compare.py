"""Declared-field compare — the PURE half of the `compare_declared_fields` tool (Config sources STEP 2, Group K1).

Given the text of a manifest file and a way to GET one live object, report — per object the manifest names — the
DECLARED field paths whose live value differs. Nothing else:

  - GET only. No list, no patch, no dry-run, no server-side apply (the native server-side diff needs `patch`; it is
    register K8S-SSA-DIFF, filed, not built).
  - PATHS only, never values. A differing path is reported as `value-differs`, `type-differs` or `missing-live`
    (a declared mapping or list with no live counterpart is ONE `missing-live` at its own path).
    Neither the declared value nor the live value is returned, so the result carries no more than the caller's own
    key names and list-item names.
  - DECLARED paths only. A field the manifest does not state is never read out of the live object, so API-server
    defaults, status, managedFields and live-only annotations are not compared.
  - A `Secret` is never fetched and never compared (`secret-never-compared`), whatever the caller's RBAC allows.
  - Anything that is not one rendered, allowlisted object is `not-compared` with a named reason (a kustomization, a Helm values
    file, a `List`, a kind the service does not allow).
  - ONE cluster-scoped kind may be compared when the service passes it: `Namespace`, fetched BY NAME (the manifest supplies the
    name). Its labels decide which NetworkPolicies select it and which Pod Security level applies, so drift there is real drift.
    It is never listed — a service cannot enumerate namespaces through this tool.

This module imports no Kubernetes client, so its tests run without a cluster (`test_declared_compare.py`).

QUANTITIES are compared by VALUE (method /2): at a quantity-typed path of an allowed kind (`_QUANTITY_PATHS` below — resource
requests/limits, pod overhead, `emptyDir.sizeLimit`, ResourceQuota `spec.hard`, LimitRange limits, HPA metric targets) both sides
are parsed with the Kubernetes Quantity grammar and compared as exact decimals, so `1000m` declared equals `1` live and `cpu: 1`
(a YAML number) equals `"1"`; `1G` and `1Gi` still differ. If EITHER side does not parse, the ordinary comparison applies — a
spelling the parser does not know is reported as a difference, never hidden.

Named residual noise (reported as a difference although the cluster would treat both sides as equal):
  - a list whose items carry no `name` is compared by POSITION;
  - a string the manifest writes as a number or boolean without quotes in a string-typed field (`"80"` vs `80`) is
    `type-differs`; so is an unquoted date (YAML reads `2026-11-15` as a date, the cluster holds a string).
"""
from __future__ import annotations

import hashlib
import re
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any, Callable, Optional

import yaml

METHOD = "k8s-declared-field-compare/2"   # /2 (2026-11-16): quantities compared by value

MAX_MANIFEST_BYTES = 262_144      # 256 KB of manifest text
MAX_DOCUMENTS = 50                # objects per call (one GET each, at most)
MAX_DEPTH = 40                    # nesting depth of a declared object
MAX_DECLARED_PATHS = 5_000        # leaf paths per object
MAX_DIFFERING_PATHS = 200         # paths returned per object (the total is always reported)
MAX_RESULT_PATHS = 1_000          # paths returned by ONE call, all objects together (sec-ops F7)
MAX_PATH_CHARS = 200              # one returned path
MIN_MARKER_CHARS = 8              # sec-ops F4: a one-character marker would suppress every comparison
MAX_MARKER_CHARS = 64
MAX_FLOW_NESTING = 64             # unclosed `[` / `{` at any point of the text (sec-ops F1)


class CompareRefusal(Exception):
    """The whole call is refused (the caller turns it into an isError result). The message names no manifest content."""


# What the caller's GET returns for one object.
#   ("found", <dict>) | ("absent", None) | ("error", "<status> <reason>")
GetLive = Callable[[str, str, str, str], tuple]


def _clean(text: Any, limit: int) -> str:
    """Manifest text echoed in the result (a name, a key inside a path): printable, one line, capped."""
    return "".join(c if c.isprintable() else "?" for c in str(text))[:limit]


def _is_scalar(v: Any) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


def _empty(v: Any) -> bool:
    return v is None or v == {} or v == [] or v == ""


def _same_scalar(declared: Any, live: Any) -> Optional[str]:
    """None when equal, else the difference kind."""
    if isinstance(declared, bool) or isinstance(live, bool):
        if isinstance(declared, bool) and isinstance(live, bool):
            return None if declared == live else "value-differs"
        return "type-differs"
    if isinstance(declared, (int, float)) and isinstance(live, (int, float)):
        return None if declared == live else "value-differs"
    if isinstance(declared, str) and isinstance(live, str):
        return None if declared == live else "value-differs"
    if _empty(declared) and _empty(live):
        return None
    return "type-differs"


# ── Kubernetes quantities ──────────────────────────────────────────────────────────────────────────────────────────────
# The grammar of k8s.io/apimachinery resource.Quantity: <sign><digits>[.<digits>]<suffix>, suffix = a binary SI suffix, a
# decimal SI suffix, or a decimal exponent (e/E followed by a signed integer). "E" alone is exa; "E3" is an exponent.
_QTY_NUMBER = re.compile(r"([+-]?)([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(.*)")
_QTY_EXPONENT = re.compile(r"[eE]([+-]?[0-9]{1,3})")
_QTY_SUFFIX = {"": 1, "n": Decimal("1e-9"), "u": Decimal("1e-6"), "m": Decimal("1e-3"), "k": Decimal(10) ** 3,
               "M": Decimal(10) ** 6, "G": Decimal(10) ** 9, "T": Decimal(10) ** 12, "P": Decimal(10) ** 15,
               "E": Decimal(10) ** 18, "Ki": Decimal(2) ** 10, "Mi": Decimal(2) ** 20, "Gi": Decimal(2) ** 30,
               "Ti": Decimal(2) ** 40, "Pi": Decimal(2) ** 50, "Ei": Decimal(2) ** 60}
_QTY_MAX_CHARS = 64

# Quantity-typed paths, per allowed kind (a path is matched whole; a key with dots or a slash is a ["..."] segment).
_SEG = r'(?:\.[A-Za-z0-9_-]+|\["[^"\]]*"\])'
_POD_QTY = (r"(?:^|\.)resources\.(?:requests|limits)" + _SEG + "$",      # containers, initContainers, pod-level, STS claims
            r"(?:^|\.)overhead" + _SEG + "$",
            r"\.emptyDir\.sizeLimit$")
_QUANTITY_PATHS = {kind: tuple(re.compile(x) for x in pats) for kind, pats in {
    "Pod": _POD_QTY, "Deployment": _POD_QTY, "ReplicaSet": _POD_QTY, "StatefulSet": _POD_QTY, "DaemonSet": _POD_QTY,
    "ResourceQuota": (r"^spec\.hard" + _SEG + "$",),
    "LimitRange": (r"^spec\.limits\[[0-9]+\]\.(?:max|min|default|defaultRequest|maxLimitRequestRatio)" + _SEG + "$",),
    "HorizontalPodAutoscaler": (r"^spec\.metrics\[[0-9]+\]\.(?:resource|containerResource|pods|object|external)"
                                r"\.target\.(?:value|averageValue)$",),
}.items()}


def _quantity(v: Any) -> Optional[Decimal]:
    """The exact value of a Kubernetes quantity, or None when `v` is not one (the caller then compares as before)."""
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        return None
    text = v if isinstance(v, str) else repr(v)
    if not text or len(text) > _QTY_MAX_CHARS:
        return None
    m = _QTY_NUMBER.fullmatch(text)
    if not m:
        return None
    sign, number, suffix = m.groups()
    with localcontext() as ctx:
        ctx.prec = 80
        try:
            base = Decimal(number)
        except InvalidOperation:
            return None
        if suffix in _QTY_SUFFIX:
            value = base * _QTY_SUFFIX[suffix]
        else:
            e = _QTY_EXPONENT.fullmatch(suffix)
            if not e:
                return None
            value = base.scaleb(int(e.group(1)))
        return -value if sign == "-" else value


def _same_quantity(declared: Any, live: Any) -> Optional[str]:
    """None when equal by value; "value-differs" when both parse and differ; otherwise the ordinary comparison."""
    d, l = _quantity(declared), _quantity(live)
    if d is None or l is None:
        return _same_scalar(declared, live)
    return None if d == l else "value-differs"


def _named(items: list) -> bool:
    """Every item is a mapping with a distinct string `name` — the merge key Kubernetes uses for containers, env, volumes."""
    if not items or not all(isinstance(i, dict) and isinstance(i.get("name"), str) and i["name"] for i in items):
        return False
    names = [i["name"] for i in items]
    return len(set(names)) == len(names)


def _seg(key: str) -> str:
    k = str(key)
    return k if k.replace("-", "").replace("_", "").isalnum() else '["' + k.replace('"', "'") + '"]'


def _join(base: str, key: str) -> str:
    s = _seg(key)
    if not base:
        return s
    return base + s if s.startswith("[") else base + "." + s


class _Walk:
    def __init__(self, redacted_marker: Optional[str], quantity_paths: tuple = ()):
        self.marker = redacted_marker
        self.quantity_paths = quantity_paths
        self.declared = 0
        self.differing: list = []
        self.redacted: list = []
        self.over_limit = False

    def _leaf(self) -> bool:
        self.declared += 1
        if self.declared > MAX_DECLARED_PATHS:
            self.over_limit = True
            return False
        return True

    def _count(self, declared: Any, depth: int) -> None:
        if depth > MAX_DEPTH:
            raise CompareRefusal("manifest nests deeper than the compare limit")
        if isinstance(declared, dict) and declared:
            for v in declared.values():
                self._count(v, depth + 1)
        elif isinstance(declared, list) and declared:
            for v in declared:
                self._count(v, depth + 1)
        else:
            self._leaf()

    def _all_empty(self, declared: Any) -> bool:
        if isinstance(declared, dict):
            return all(self._all_empty(v) for v in declared.values())
        if isinstance(declared, list):
            return all(self._all_empty(v) for v in declared)
        return _empty(declared)

    def _diff(self, path: str, kind: str) -> None:
        self.differing.append({"path": _clean(path, MAX_PATH_CHARS), "difference": kind})

    def _marked(self, text: Any) -> bool:
        return bool(self.marker) and isinstance(text, str) and self.marker in text

    def _skip_redacted(self, declared: Any, path: str, depth: int) -> None:
        """A redaction placeholder in a KEY or a list-item NAME: the subtree cannot be matched, so it is not compared."""
        self._count(declared, depth)
        self.redacted.append(_clean(path, MAX_PATH_CHARS))

    def walk(self, declared: Any, live: Any, live_present: bool, path: str, depth: int) -> None:
        if self.over_limit:
            return
        if depth > MAX_DEPTH:
            raise CompareRefusal("manifest nests deeper than the compare limit")
        if not live_present and isinstance(declared, (dict, list)) and declared:
            # A declared mapping or list with NO live counterpart is ONE difference at its own path (not one per leaf).
            self._count(declared, depth)
            if not self.over_limit and not self._all_empty(declared):
                self._diff(path, "missing-live")
            return
        if isinstance(declared, dict):
            if not declared:
                if self._leaf() and live_present and not _empty(live) and not isinstance(live, dict):
                    self._diff(path, "type-differs")
                return
            if live_present and not isinstance(live, dict) and not _empty(live):
                if self._leaf():
                    self._diff(path, "type-differs")
                return
            live_map = live if isinstance(live, dict) else {}
            for k in declared:
                if self._marked(k):
                    self._skip_redacted(declared[k], _join(path, k), depth + 1)
                    continue
                self.walk(declared[k], live_map.get(k), k in live_map, _join(path, k), depth + 1)
            return
        if isinstance(declared, list):
            if not declared:
                if self._leaf() and live_present and not _empty(live) and not isinstance(live, list):
                    self._diff(path, "type-differs")
                return
            if live_present and not isinstance(live, list) and not _empty(live):
                if self._leaf():
                    self._diff(path, "type-differs")
                return
            live_list = live if isinstance(live, list) else []
            if _named(declared):
                by_name = {i.get("name"): i for i in live_list if isinstance(i, dict)}
                for item in declared:
                    n = item["name"]
                    if self._marked(n):
                        self._skip_redacted(item, f'{path}[name={n}]', depth + 1)
                        continue
                    self.walk(item, by_name.get(n), n in by_name, f'{path}[name={n}]', depth + 1)
            else:
                for idx, item in enumerate(declared):
                    present = idx < len(live_list)
                    self.walk(item, live_list[idx] if present else None, present, f"{path}[{idx}]", depth + 1)
                if all(_is_scalar(i) for i in declared) and len(live_list) > len(declared):
                    # a scalar list (args, command) is declared WHOLE: extra live items are a difference of this path
                    self._diff(path, "value-differs")
            return
        # scalar
        if not self._leaf():
            return
        if self.marker and isinstance(declared, str) and self.marker in declared:
            self.redacted.append(_clean(path, MAX_PATH_CHARS))
            return
        if not live_present:
            if not _empty(declared):
                self._diff(path, "missing-live")
            return
        if any(q.search(path) for q in self.quantity_paths):
            kind = _same_quantity(declared, live)
        else:
            kind = _same_scalar(declared, live)
        if kind:
            self._diff(path, kind)


def _load_documents(manifest: str) -> list:
    data = manifest.encode("utf-8")
    if len(data) > MAX_MANIFEST_BYTES:
        raise CompareRefusal(f"manifest is larger than the compare limit ({MAX_MANIFEST_BYTES} bytes)")
    # sec-ops F1: a LINEAR pre-check before the YAML scanner sees the text — the scanner is super-linear on deep flow
    # nesting (60,000 `[` held a CPU for 20 s) and the loader recurses. Brackets inside quoted strings count too; a
    # manifest with that many unclosed brackets in a string is refused, which is the safe side.
    open_now = 0
    for ch in manifest:
        if ch in "[{":
            open_now += 1
            if open_now > MAX_FLOW_NESTING:
                raise CompareRefusal("manifest nests brackets deeper than the compare limit")
        elif ch in "]}" and open_now:
            open_now -= 1
    try:
        # Refuse anchors/aliases before constructing anything: an alias can expand a small text into a huge object.
        for tok in yaml.scan(manifest, Loader=yaml.SafeLoader):
            if isinstance(tok, (yaml.AliasToken, yaml.AnchorToken)):
                raise CompareRefusal("manifest uses YAML anchors or aliases, which this compare does not expand")
        docs = list(yaml.safe_load_all(manifest))
    except CompareRefusal:
        raise
    except yaml.YAMLError:
        raise CompareRefusal("manifest is not parseable YAML")
    except Exception:  # noqa: BLE001 — RecursionError, a 5,000-digit integer (ValueError), anything else: refused, never raised
        raise CompareRefusal("manifest could not be read")
    if len(docs) > MAX_DOCUMENTS:
        raise CompareRefusal(f"manifest holds more than {MAX_DOCUMENTS} documents")
    return docs


def compare_manifest(manifest: str, kinds: dict, get_live: GetLive,
                     default_namespace: Optional[str] = None, redacted_marker: Optional[str] = None,
                     cluster_kinds: Optional[dict] = None) -> dict:
    """Compare every object `manifest` declares against its live object.

    `kinds` maps (apiVersion, kind) -> the service's resourceType (its CLOSED allowlist of NAMESPACED kinds).
    `cluster_kinds` maps (apiVersion, kind) -> resourceType for the CLUSTER-SCOPED kinds this compare may fetch BY NAME (the service
        passes `Namespace` only). Such an object has no namespace: it is fetched with `namespace=None` and never listed. A caller
        that passes none keeps the old behaviour (`kind-not-allowlisted`).
    `get_live(resource_type, api_version_kind_label, namespace, name)` performs ONE get and never raises.
    """
    if not isinstance(manifest, str) or not manifest.strip():
        raise CompareRefusal("manifest is empty")
    if redacted_marker is not None and (not isinstance(redacted_marker, str)
                                        or not MIN_MARKER_CHARS <= len(redacted_marker) <= MAX_MARKER_CHARS):
        raise CompareRefusal(f"redactedMarker must be {MIN_MARKER_CHARS}-{MAX_MARKER_CHARS} characters")
    docs = _load_documents(manifest)
    objects = []
    compared = 0
    paths_left = MAX_RESULT_PATHS
    for index, doc in enumerate(docs):
        if doc is None:
            continue  # an empty document between `---` lines
        entry: dict = {"index": index}
        if not isinstance(doc, dict) or not isinstance(doc.get("apiVersion"), str) or not isinstance(doc.get("kind"), str):
            objects.append({**entry, "state": "not-compared", "reason": "not-an-object"})
            continue
        api_version, kind = doc["apiVersion"], doc["kind"]
        entry.update({"apiVersion": _clean(api_version, 128), "kind": _clean(kind, 128)})
        md = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
        name = md.get("name") if isinstance(md.get("name"), str) else None
        if name:
            entry["name"] = _clean(name, 253)
        if kind == "Secret":
            objects.append({**entry, "state": "not-compared", "reason": "secret-never-compared"})
            continue
        cluster_type = (cluster_kinds or {}).get((api_version, kind))
        resource_type = cluster_type or kinds.get((api_version, kind))
        if resource_type is None:
            objects.append({**entry, "state": "not-compared", "reason": "kind-not-allowlisted"})
            continue
        if not name:
            objects.append({**entry, "state": "not-compared", "reason": "no-name"})
            continue
        if cluster_type:
            # A cluster-scoped object is named, never namespaced: ONE get by name. `defaultNamespace` does not apply to it.
            namespace = None
        else:
            namespace = md.get("namespace") if isinstance(md.get("namespace"), str) and md.get("namespace") else default_namespace
            if not namespace:
                objects.append({**entry, "state": "not-compared", "reason": "no-namespace"})
                continue
            entry["namespace"] = _clean(namespace, 253)
        status, payload = get_live(resource_type, f"{api_version}/{kind}", namespace, name)
        if status == "invalid":
            objects.append({**entry, "state": "not-compared", "reason": "name-or-namespace-invalid"})
            continue
        if status == "absent":
            objects.append({**entry, "state": "absent-live"})
            continue
        if status != "found" or not isinstance(payload, dict):
            objects.append({**entry, "state": "not-compared", "reason": "live-read-failed",
                            **({"detail": _clean(payload, 60)} if payload else {})})
            continue
        w = _Walk(redacted_marker, _QUANTITY_PATHS.get(kind, ()))
        for key, value in doc.items():
            if key in ("apiVersion", "kind", "status"):
                continue
            if key == "metadata":
                declared_md = {k: v for k, v in md.items() if k not in ("name", "namespace")}
                w.walk(declared_md, payload.get("metadata"), "metadata" in payload, "metadata", 1) if declared_md else None
                continue
            w.walk(value, payload.get(key), key in payload, _seg(key), 1)
        if w.over_limit:
            objects.append({**entry, "state": "not-compared", "reason": "too-many-declared-fields"})
            continue
        compared += 1
        shown = w.differing[:min(MAX_DIFFERING_PATHS, paths_left)]
        paths_left -= len(shown)
        shown_redacted = w.redacted[:min(MAX_DIFFERING_PATHS, paths_left)]
        paths_left -= len(shown_redacted)
        objects.append({
            **entry, "state": "compared", "declaredPaths": w.declared,
            "differingTotal": len(w.differing), "differing": shown,
            **({"differingTruncated": True} if len(w.differing) > len(shown) else {}),
            # always present (sec-ops F4): a reader must never take "no difference" from a compare that skipped values
            "redactedNotComparedTotal": len(w.redacted),
            **({"redactedNotCompared": shown_redacted} if w.redacted else {}),
            **({"redactedNotComparedTruncated": True} if len(w.redacted) > len(shown_redacted) else {}),
        })
    return {
        "method": METHOD,
        "manifestSha256": hashlib.sha256(manifest.encode("utf-8")).hexdigest(),
        "documents": len(docs),
        "objectsCompared": compared,
        "objects": objects,
    }
