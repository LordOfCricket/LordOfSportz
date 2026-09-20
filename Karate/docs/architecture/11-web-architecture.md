# Web Architecture

Next.js 14 (App Router) + TypeScript + Tailwind CSS.

## Design system

Tokens are CSS custom properties in `apps/web/src/app/globals.css` (light + dark, following the
system color scheme via `prefers-color-scheme`, with a `data-theme` override hook for a future manual
toggle), consumed through Tailwind's `theme.extend.colors` in `tailwind.config.ts` — components never
reference a raw hex value.

Palette direction: deep charcoal/ink + warm off-white surfaces, a restrained red competition accent,
and a metallic gold reserved for rank/medal moments (not decoration). Semantic colors
(success/warning/danger/info) are intentionally distinct from the brand accent red so color always
carries meaning, never just decoration (product spec section 27).

Primitives in `apps/web/src/components/ui/`: `Button`, `Card`, `Badge`, `Input`, `Alert`, `EmptyState`,
`Skeleton`, `StatTile`. One design language, reused across all four role dashboards — only the
navigation items change per role (`apps/web/src/lib/navigation.ts`), not the shell or components.

## Route structure

```
app/
  page.tsx                    marketing/landing
  dashboard/
    player/  layout.tsx (DashboardShell role=PLAYER) + page.tsx (real overview) + sub-routes
    coach/   same pattern
    academy/ same pattern
    scorer/  same pattern (fewer sub-routes — see mobile UX note below)
```

Every role's `page.tsx` overview is a real, populated screen (demo data, clearly labeled — see
`lib/mock-data.ts`). Every sub-route beyond the overview is a `ComingSoon` placeholder in Phase 1,
so navigation never dead-ends in a 404 while the underlying feature isn't built yet.

`dashboard/player/` additionally demonstrates the required per-screen states (product spec section 38)
via Next's file conventions: `loading.tsx` (skeleton) and `error.tsx` (retry). The other three role
roots follow the same pattern once their data fetching is real (Phase 1 renders synchronously from
mock data, so loading/error states aren't yet meaningfully exercised there).

## What's NOT implemented

No authentication flow (login/register pages), no real data fetching (no calls to `apps/api` yet —
`@karate/validation` schemas are ready to reuse client-side once a form exists), no state
management library, no i18n.
