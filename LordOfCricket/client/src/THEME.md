# LOC light theme — shared design system

Reference: the V2 homepage (`src/components/home/v2/*`, `src/pages/discovery/DiscoveryPage.jsx`).

## Tokens (`src/index.css`, `@theme` block)

| Token | Value | Tailwind utilities |
| --- | --- | --- |
| `--color-loc-mint` | `#f0fdf4` | `bg-loc-mint` (page / muted surface) |
| `--color-loc-surface` | `#ffffff` | `bg-loc-surface` (cards) |
| `--color-loc-navy` | `#0f172a` | `text-loc-navy` (headings, primary text) |
| `--color-loc-ink` | `#1e293b` | `text-loc-ink` (body text) |
| `--color-loc-muted` | `#475569` | `text-loc-muted` (secondary text) |
| `--color-loc-faint` | `#94a3b8` | `text-loc-faint` (labels) |
| `--color-loc-green` | `#15803d` | `text-loc-green` / `bg-loc-green` (accent) |
| `--color-loc-green-strong` | `#166534` | hover state |
| `--color-loc-green-bright` | `#16a34a` | strong CTA fill |
| `--color-loc-border` | `#d1fae5` | `border-loc-border` (mint border) |
| `--color-loc-border-soft` | `#e2e8f0` | `border-loc-border-soft` (form controls) |
| `--radius-loc` | `1rem` | `rounded-loc` |
| `--shadow-loc` / `--shadow-loc-md` | soft | `shadow-loc` / `shadow-loc-md` |

Fonts already present: `font-loc-display` (Barlow Condensed), `font-loc-body` (Barlow).

## Component classes (`@layer components`)

`.loc-page` `.loc-card` `.loc-card-hover` `.loc-heading` `.loc-eyebrow`
`.loc-btn` `.loc-btn-outline` `.loc-input`
`.loc-badge` + `.loc-badge-active|inactive|warn|danger`

## React primitives (`src/components/ui/`)

`LocButton` (`variant="solid|outline"`, `to`/`href` → link), `LocCard` (`hover`, `padded`, `as`),
`LocField` (`label`, `as="input|textarea|select"`), `LocBadge` (`tone`).

## Migrating a page

1. Outer wrapper → `className="loc-page"` (or `bg-loc-mint text-loc-navy`).
2. Panels/cards → `<LocCard>` or `loc-card [loc-card-hover] p-5 sm:p-6`.
3. Headings → `loc-heading` + a text size; eyebrows → `loc-eyebrow`.
4. Buttons → `<LocButton>` / `loc-btn` / `loc-btn-outline`.
5. Inputs/select/textarea → `<LocField>` / `loc-input w-full`.
6. Status pills → `<LocBadge tone=…>`.
7. Replace ad-hoc `bg-white` / `text-slate-900` / `border-emerald-100` etc. with the
   tokens above. Do **not** re-introduce raw hex or repeat palette utilities.

Deliberate dark accent blocks (homepage Hall of Fame band, footer, "Who We Are"
panel) intentionally keep literal dark greens — they are contrast sections, not
the base surface.

## Not yet migrated

Public shared shell (`components/home/Navbar.jsx`, `SiteFooter.jsx`,
`components/layout/Layout.jsx`), the Super Admin shell (`AdminLayout`,
`AdminSidebar`) and every page body outside `components/home/v2/*` still use the
legacy dark palette (`bg-loc-dark`, `loc-gold`, glass cards). Migrate per the
recipe above, shell + its page bodies together (a light shell over a dark body
reads as broken), one cluster at a time.
