# Belt / Grading Architecture

## Model

```
KarateStyle (e.g. Shotokan)
  -> BeltSystem (e.g. "WKF Standard Kyu/Dan" — a style can have more than one system)
      -> BeltGrade (e.g. "3rd Kyu", rankOrder=7, type=KYU)

PlayerBeltHistory (append-only)
  -> player, beltGrade, gradingEvent?, awardingAcademy?, examiner?
  -> verificationStatus: UNVERIFIED | PENDING | VERIFIED | REJECTED
  -> isCurrent: true for exactly one row per player at a time
  -> certificate?: Certificate
```

Styles and belt systems are **data, not enums** — adding a new federation's grading system is an
`INSERT`, not a migration. `BeltGrade.rankOrder` is the ordering key (not the name string), so
progression comparisons (`isPromotionFrom(a, b)`) are a simple integer comparison regardless of how
many kyu/dan a given system defines.

## Why belt is never a column on Player

A `belt: string` field can only ever hold "current belt" and loses everything else the product spec
requires: who examined the grading, which academy hosted it, whether it's verified, and the full
progression history. `PlayerBeltHistory` is append-only (`isCurrent` flips, old rows are never
deleted or edited) so:

- A player's full progression is one query away (`WHERE playerId = ? ORDER BY awardedDate`).
- Disputed/incorrect gradings can be marked `REJECTED` without destroying the record that it was
  claimed.
- Certificates can be verified independently of the belt record they back
  (`Certificate.verificationCode` is a separate, unique, checkable token).

## What Phase 1 implements vs. scaffolds

- **IMPLEMENTED**: full schema, migrated and seeded (`packages/database/prisma/seed.ts` creates a
  demo `KarateStyle` → `BeltSystem` → three `BeltGrade` rows).
- **NOT IMPLEMENTED**: any API endpoint or UI for recording a grading event, verifying a certificate,
  or rendering belt history. The player dashboard's "Belt & Certificates" screen is a placeholder.
