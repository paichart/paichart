# Shared List-Page Primitives Pattern

**Version**: 1.0.0
**Created**: 2026-06-30
**Category**: UI/UX Pattern Library
**Confidence**: 94% (3 production consumers — `/agents`, `/workflows`, `/prompt-library` — + 3-specialist review + a live form-strip gate)
**Applicability**: Any admin "list of things + edit one" page (sortable table overview → row actions → a builder/editor)

---

## Executive Summary

When several admin pages each show **a sortable list of entities + an editor for one**, extract the **invariant chrome** into shared primitives and adopt them across all pages — but **keep the page-shaped pieces separate**. Three sibling pages (Agents, Workflows, Skills/prompt-library) drifted into three different looks; this pattern unified them on one design language while validating the extraction boundary (3 identical consumers).

**The five shared primitives** (`components/ui/`):
1. `PageHeader` — icon + `<h1>` + subtitle (+ optional actions)
2. `RowActionIcon` — icon-button + Tooltip + `stopPropagation`, with `default | danger | run` variants
3. `useSortableRows<F>()` — asc/desc state + a clickable `<SortHeader>` (▲▼); the **comparator stays per-page**
4. `TableSearch` — narrow search input for the table toolbar (controlled; the page owns the query + filtering)
5. `TableFilter` (+ `deriveTableOptions`) — compact filter dropdown; `deriveTableOptions(items, accessor)` builds de-duped/sorted options from the data (works for enums / `string | null`)

**The page assembly**: `PageHeader` → tabs (`List` · `Builder` · `How it works`) → a **toolbar (search + filters) above** a Bloomberg-style sortable table whose row actions feed a promoted editor tab.

**ROI**: the 2nd and 3rd pages reuse 100% of the primitives — the third (Skills) shipped in one pass with no specialist re-review and no gate.

---

## The extraction boundary (the load-bearing rule)

> **Share the small invariant pieces every page imports *identically*; keep the page-shaped pieces separate.
> The moment a "shared" component needs a prop to branch on *which page* it serves — or a generic column API to
> express bespoke cells — it has crossed into over-abstraction.**

| Candidate | Verdict | Why |
|---|---|---|
| **PageHeader** | **SHARE** | Identical markup everywhere, zero domain logic |
| **RowActionIcon** (incl. a `run` variant) | **SHARE** | Same button chrome repeated 3-4×/row; handlers stay per-page. A new action (Run) is just another instance — and *omitting* it (Skills has no Run) proves it isn't over-fit |
| **useSortableRows + SortHeader** | **SHARE** | The asc/desc toggle + ▲▼ header is mechanical; the comparator is page-specific (stays in the page) |
| **TableSearch + TableFilter** (+ `deriveTableOptions`) | **SHARE** | Search input + compact filter dropdowns in a **toolbar above the table** (matches the app's `/pov/list` convention). The *filter fields + matched columns* are per-page; options are derived from the data; the chrome is shared |
| **Table styling** | **SHARE — already** | `lib/constants/bloomberg-styles.ts` constants |
| **Tab shell** | **SHARE — already** | `@/components/ui/Tabs`; copy the `?tab=` URL-sync convention, don't wrap it |
| **Table columns / cells / row renderer** | **KEEP-SEPARATE** | Columns + cell logic differ per entity. A generic column-config API is the over-abstraction trap |
| **The builder/editor form** | **KEEP-SEPARATE** | Different schemas (e.g. a workflow step-array vs a prompt form). One shared builder is the canonical over-abstraction |
| **The preview pane** | **KEEP-SEPARATE** | Renders an entity-specific artifact |
| **"How it works" content** | **KEEP-SEPARATE** | Bespoke prose; only "Cards + prose" (= just use `Card`) is shared |

---

## The primitives (code)

### `components/ui/PageHeader.tsx`
```tsx
export function PageHeader({ icon: Icon, iconClassName, title, subtitle, actions }: {
  icon?: LucideIcon; iconClassName?: string; title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {Icon && <Icon className={cn('h-7 w-7', iconClassName ?? 'text-primary')} />}
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

### `components/ui/RowActionIcon.tsx`
Icon-button + Tooltip + `stopPropagation`; `variant` drives the hover color (`default` muted, `danger` red, `run` emerald). Handlers stay per-page; the button chrome is shared. Must live inside a `<TooltipProvider>` (the table provides one).

### `components/ui/useSortableRows.tsx`
```tsx
const { sortField, sortDirection, SortHeader } = useSortableRows<SortField>('initialField');
// page keeps its own: const sorted = useMemo(() => [...items].sort(comparator), [items, sortField, sortDirection]);
```

---

## ⚠️ Runtime preservation discipline (when a sortable table feeds an editor)

If the entity carries **JSONB / unknown-key fields the editor must round-trip** (the "form-strip" bug class — see `field-leakage-prevention-pattern.md` / `boundary-contract-wrapper-enforcement-pattern.md`), the table→editor hop is a field-leakage boundary. The TypeScript type does **not** protect you (optional fields can be omitted by a `.map()` and still typecheck). The **binding controls are runtime**:

- **M1 — force editor remount**: `key={editing?.id ?? 'new'}`. Editors that read props into `useState` *once* show a stale form when a persistent tab just swaps the prop.
- **M2 — store the full object, not an id**: `const [editing, setEditing] = useState<Entity | null>(null)`. (Don't blindly mirror an id-based editor flow — if the editor doesn't self-fetch, an id forces a lossy reconstruction.)
- **M3 — no row-model in the table**: `[...items].sort()` keeps full objects; pass the **same reference** to `onEdit`. **Never** `.map()` rows into a `{id,name,…}` subset — that silently drops the preservation fields. Eyeball this at review; the compiler won't catch it.
- **Gate it**: seed a canary with an unknown top-level key *and* an unknown per-step/nested key, edit via the new flow, assert both survive in the DB (bisect at the network hop: missing-from-body = read-path narrowing; in-body-not-in-DB = write/schema). If the entity has **no** such lane (e.g. prompts edit `variables`/`examples` as raw JSON), the gate is unnecessary.

---

## Migration sequence (per page)

1. **Extract the primitives, adopt in the *reference* page first** with **zero visual change** (equivalence gate against a known-good page).
2. **Lift the data layer** (CRUD/run handlers) into a `useX` hook so the table + editor share one source. Fix latent bugs in the lift (e.g. a clone that drops fields), don't silently "improve" them mid-move.
3. **Build the `XBloombergView` table** (own columns; M3 reference discipline) + row actions.
4. **Promote the existing editor** to a first-class Builder tab (M1 + M2). Gate on the form-strip canary here if applicable.
5. **Add a "How it works" tab** (durable/conceptual content — never inventory/counts, which drift).
6. **Standardize loading/error**: inline `Card` loading; drop cargo-culted Suspense/`WidgetWrapper` whose fallback never fires; keep the route `error.tsx` (real crash boundary).
7. **Delete the old monolith** + run a Protocol 11 drift sweep (barrel exports, stale comments).

Keep access control unchanged — "match the reference page" is about **UX chrome, not auth** (e.g. an admin-gate wrapper stays).

---

## Proven Results (2026-06-30)

| Page | Outcome |
|---|---|
| `/agents` | reference; primitives extracted + adopted with zero visual change |
| `/workflows` | full migration; **live `_rawConfig` canary gate passed** (both preservation lanes survived); dead terminal removed |
| `/prompt-library` → **Skills** | second migration in one pass; reused every primitive; **omitted Run** (proving `RowActionIcon` wasn't over-fit); no gate needed (raw-JSON fields) |

By-products surfaced + fixed: an app-wide orphaned `<Toaster />` (every toast silently swallowed), a silent name-drop (an immutable field rendered editable), and a broken clone (bare-array payload + dropped JSONB).

Full record: `cline_docs/reviews/ui-alignment-2026-06-30/` (PLAN.md + IMPLEMENTATION-PLAN-v2.md + 3-specialist review + boundary-contract glance).

---

## Where to apply

Any future admin "list + editor" surface — POV/Phase/Stage management, Team management, Service registry, User management. Reuse `PageHeader`/`RowActionIcon`/`useSortableRows` as-is; write the entity's columns + editor + How-it-works; apply the M1/M2/M3 + gate discipline only if the entity has a JSONB/unknown-key preservation lane.

**Two halves — the chrome half applies more widely than the table half.** Split the primitives into *page chrome* (`PageHeader` + the full-width `p-6 space-y-6` container, **no** `container mx-auto`) and *table primitives* (`TableSearch`/`TableFilter`/`useSortableRows`/`RowActionIcon`). The **chrome half applies to ANY page** — including **dashboards** that have no sortable list (charts/metrics/timelines). The **table half is list-only**; don't force it onto a dashboard whose tabs are charts. Example: `/analytics` (2026-07-01) adopted full-width + `PageHeader` (controls in the `actions` slot) to match the three list pages, but kept zero table primitives — its four tabs are charts/history components, and its one list-ish tab (`AgentHistoryView`) is self-contained with its own filters, so re-plumbing it would be churn with no gain. Rule of thumb: **if the page has a header it should use `PageHeader` and be full-width; it only needs the table primitives if it has a sortable list+editor.**

---

**Pattern Status**: Production-Ready ✅
**Confidence**: 94%
**Recommended**: Reuse the primitives for all admin list+editor pages; do NOT generalize the table columns or the builder
