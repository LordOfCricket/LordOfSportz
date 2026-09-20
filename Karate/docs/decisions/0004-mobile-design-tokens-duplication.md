# ADR-0004: Duplicate design tokens between web and mobile (for now)

## Status

Accepted (Phase 1), expected to be revisited.

## Context

Web uses CSS custom properties (`apps/web/src/app/globals.css`) consumed via Tailwind. React Native
has no CSS and no Tailwind-equivalent without adding a library (e.g. NativeWind) and its own build
config. Both clients need to read as one visual system (product spec section 25/31).

## Decision

Hand-maintain a second, parallel token file, `apps/mobile/src/theme/tokens.ts`, with the same color
values, spacing scale, and radii as the web tokens, consumed via React Native `StyleSheet` objects.

## Alternatives considered

- **Add NativeWind to get Tailwind classes in React Native.** Rejected for Phase 1: another build
  dependency and config surface to debug in an environment where the mobile app couldn't be run on a
  device/emulator to verify it. Plain `StyleSheet` is the lowest-risk way to ship a real, working
  screen set this phase.
- **Extract a shared `@karate/design-tokens` package now.** Rejected for Phase 1: with only two
  consumers and no build/verification step for the token format itself, the abstraction is premature
  — three lines of duplication across two files is cheaper than a package to maintain for a token set
  that isn't finalized yet.

## Consequence

When the palette changes, both `globals.css` and `tokens.ts` must be updated by hand. This is an
accepted, documented cost — a follow-up should extract `@karate/design-tokens` once NativeWind (or an
equivalent) is adopted or a third consumer appears.
