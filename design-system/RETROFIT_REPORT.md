# RosterSync design system retrofit

This migration follows `RosterSync/design-system/llm-prompt.json` (Step 1 audit → Step 9 verify). Source of truth: **`design-system/rostersync.css`** (copy of `RosterSync/design-system/rostersync.css`) plus **`index.html`** Tailwind theme extensions mapped to the same token hex values.

## Files touched

| Area | Files |
|------|--------|
| Tokens & base | `design-system/rostersync.css` (app copy + `.rs-btn--success` + chart dot utilities), `index.css` (imports DS, utilities, print, focus, blobs) |
| Entry | `index.html` (favicon, Tailwind `fontFamily` + `colors` + `maxWidth.rs`, removed Nunito-only + importmap), `index.tsx` |
| Brand assets | `public/rostersync-favicon.svg`, `public/rostersync-lockup-color.svg` (from `RosterSync/logos/`) |
| Primitives | `src/components/Button.tsx`, `Card.tsx`, `Badge.tsx`, `LoginForm.tsx` |
| Shell & views | `App.tsx` (shell, join flow, logos, shadows, gradients removed, headings, main width), `src/components/RosterPrintSheet.tsx` |
| Spec / prompt | This report |

## Components migrated

- **Button** — `.rs-btn` variants (`primary`, `secondary`, `danger`, `success`, `ghost`, `accent`).
- **Card** — tokenized radius, border, background (no default shadow).
- **Badge** — `.rs-pill` semantic variants (maps prior indigo/emerald/rose/amber to brand/success/danger/warning/neutral).
- **Login** — paper background, two brand-tint blobs (no purple↔orange gradient), lockup SVG, tab strip per DS tabs container pattern, `rs-field` / `rs-input` / `rs-alert`.

## Screens / UX

- **Global** — Body typography and color from DS; Tailwind `indigo` / `slate` / `emerald` / `rose` / `amber` extended to RS palette so existing utility class names keep working while matching brand.
- **Header** — Color lockup; elevation uses `var(--rs-shadow-sm)`; main content `max-w-lg` on small screens, **`md:max-w-rs` (1240px)** with horizontal padding on desktop.
- **Join department** — Alerts, field pattern, lockup; blobs use `indigo-100` + `amber-100` only.
- **Print PDF** — Fonts and neutrals use `--rs-*` variables; title uses display family.

## Escape hatches (per `llm-prompt.json`)

- **`.rs-dot-*`** in `rostersync.css` — categorical marks for charts/calendar if needed (purple, orange, info, success, warning, slate).
- **Roster calendar / list** — Still use Tailwind semantic utilities (`bg-indigo-600` for “my shift”, etc.); those classes now resolve to RS indigo (purple) scale, not legacy orange remap.

## TODO / product review

- Replace remaining one-off Tailwind sizes with strict 4px grid where easy wins exist.
- Consider moving Tailwind from CDN to PostCSS + `tailwind.config` for tree-shaking and token single-source.
- Optional: Lucide `strokeWidth={1.75}` globally for stricter iconography match.
- Visual smoke: capture each route at 1280px and 390px (not automated in this pass).

## Audit checklist (Step 1 — condensed)

- [x] Entry HTML / CSS pipeline
- [x] Primitives: Button, Card, Badge
- [x] Auth: LoginForm, JoinDepartmentView
- [x] App shell: header, nav, main width, loading overlay
- [x] Remove purple–orange gradient blends on marketing-style blocks
- [x] Logos & favicon paths
- [x] Print sheet hex removal
- [~] Full `App.tsx` tailwind pass (major surfaces; deep per-widget polish deferred)
