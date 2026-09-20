# Entity Relationship Diagrams

Split by domain cluster for readability. Field lists are trimmed to what clarifies the relationship —
see `packages/database/prisma/schema/*.prisma` for the authoritative, complete field list.

## Identity, Academy, Membership

```mermaid
erDiagram
    USER ||--o{ USER_ROLE_ASSIGNMENT : has
    USER ||--o| PLAYER_PROFILE : "may have"
    USER ||--o| COACH_PROFILE : "may have"
    USER ||--o| SCORER_PROFILE : "may have"
    USER ||--o{ ACADEMY_ADMINISTRATOR : administers
    ACADEMY ||--o{ ACADEMY_ADMINISTRATOR : "administered by"
    ACADEMY ||--o{ ACADEMY_PLAYER_MEMBERSHIP : has
    ACADEMY ||--o{ ACADEMY_COACH_AFFILIATION : has
    ACADEMY ||--o{ ACADEMY_MEMBERSHIP_REQUEST : receives
    PLAYER_PROFILE ||--o{ ACADEMY_PLAYER_MEMBERSHIP : "member via"
    COACH_PROFILE ||--o{ ACADEMY_COACH_AFFILIATION : "affiliated via"
    ACADEMY_PLAYER_MEMBERSHIP }o--o| ACADEMY_PLAYER_MEMBERSHIP : "previous (chain)"

    USER {
        uuid id PK
        string sportsHubIdentityId UK "nullable — SportsHub boundary"
        string email UK
        string fullName
    }
    ACADEMY {
        uuid id PK
        string name
        string slug UK
        enum status
    }
    ACADEMY_PLAYER_MEMBERSHIP {
        uuid id PK
        uuid academyId FK
        uuid playerId FK
        enum status "INVITED|PENDING|ACTIVE|REJECTED|LEFT|TRANSFERRED|SUSPENDED"
        uuid previousMembershipId FK "self-relation, TRANSFERRED chain"
    }
```

## Belt & Grading

```mermaid
erDiagram
    KARATE_STYLE ||--o{ BELT_SYSTEM : owns
    BELT_SYSTEM ||--o{ BELT_GRADE : defines
    BELT_SYSTEM ||--o{ GRADING_EVENT : "graded under"
    PLAYER_PROFILE ||--o{ PLAYER_BELT_HISTORY : "belt history"
    BELT_GRADE ||--o{ PLAYER_BELT_HISTORY : "awarded as"
    GRADING_EVENT ||--o{ PLAYER_BELT_HISTORY : produces
    PLAYER_BELT_HISTORY |o--o| CERTIFICATE : "backed by"

    BELT_GRADE {
        uuid id PK
        uuid beltSystemId FK
        string name "e.g. 1st Dan"
        enum type "KYU|DAN"
        int rankOrder UK "per system"
    }
    PLAYER_BELT_HISTORY {
        uuid id PK
        uuid playerId FK
        uuid beltGradeId FK
        boolean isCurrent
        enum verificationStatus
    }
```

## Tournament & Competition

```mermaid
erDiagram
    TOURNAMENT_ORGANIZER ||--o{ TOURNAMENT : organizes
    ACADEMY |o--o| TOURNAMENT_ORGANIZER : "may be (MVP branch)"
    TOURNAMENT ||--o{ TOURNAMENT_STATUS_HISTORY : logs
    TOURNAMENT ||--o{ CATEGORY : defines
    CATEGORY ||--o{ COMPETITION : scopes
    TOURNAMENT ||--o{ COMPETITION : has
    COMPETITION ||--o{ REGISTRATION : accepts
    RULE_SET ||--o{ RULE_SET_VERSION : versions
    RULE_SET_VERSION ||--o{ COMPETITION : "governs (optional)"
    REGISTRATION |o--o| ELIGIBILITY_CHECK : has
    REGISTRATION |o--o| MEDICAL_CLEARANCE : has
    REGISTRATION |o--o| WEIGH_IN : has

    TOURNAMENT {
        uuid id PK
        uuid organizerId FK
        enum status "12-state lifecycle"
    }
    TOURNAMENT_ORGANIZER {
        uuid id PK
        enum organizerType "ACADEMY|FEDERATION|ASSOCIATION|OTHER"
        uuid academyId FK "nullable, populated when ACADEMY"
    }
    COMPETITION {
        uuid id PK
        enum discipline "KUMITE|KATA"
        uuid categoryId FK
        uuid ruleSetVersionId FK
    }
```

## Officials, Draws, Bouts, Scoring

```mermaid
erDiagram
    TOURNAMENT ||--o{ TATAMI : has
    TOURNAMENT ||--o{ OFFICIAL_ASSIGNMENT : assigns
    SCORER_PROFILE ||--o{ OFFICIAL_ASSIGNMENT : "assigned as"
    TATAMI ||--o{ OFFICIAL_ASSIGNMENT : "assigned to (optional)"
    COMPETITION ||--o{ DRAW : versions
    DRAW ||--o{ ROUND : contains
    ROUND ||--o{ BOUT : contains
    TATAMI ||--o{ ROUND : hosts
    PLAYER_PROFILE ||--o{ BOUT : "competes (red/blue)"
    BOUT ||--o{ SCORE_EVENT : logs
    BOUT |o--o| BOUT_RESULT : decides
    OFFICIAL_ASSIGNMENT ||--o{ SCORE_EVENT : records

    OFFICIAL_ASSIGNMENT {
        uuid id PK
        enum function "REFEREE|JUDGE|KANSA|SCORE_SUPERVISOR|TIMEKEEPER|VIDEO_REVIEW_JUDGE|TATAMI_MANAGER"
        uuid scorerProfileId FK
        uuid tournamentId FK
    }
    SCORE_EVENT {
        uuid id PK
        uuid boutId FK
        string eventType "discipline-specific"
        string clientOperationId UK "idempotency key"
    }
```

## Stats & Rankings

```mermaid
erDiagram
    SEASON ||--o{ PLAYER_STATS : scopes
    SEASON ||--o{ COACH_STATS : scopes
    SEASON ||--o{ ACADEMY_STATS : scopes
    SEASON ||--o{ RANKING_SEASON : scopes
    RANKING_SYSTEM ||--o{ RANKING_SEASON : versions
    RANKING_SEASON ||--o{ RANKING_CATEGORY : buckets
    RANKING_CATEGORY ||--o{ RANKING_ENTRY : "current standing"
    RANKING_CATEGORY ||--o{ RANKING_POINTS_EVENT : "ledger (source of truth)"
    PLAYER_PROFILE ||--o{ RANKING_ENTRY : ranked
    PLAYER_PROFILE ||--o{ RANKING_POINTS_EVENT : earns

    PLAYER_STATS {
        uuid id PK
        uuid playerId FK
        uuid seasonId FK "nullable = career"
        int wins
        int losses
    }
    RANKING_ENTRY {
        uuid id PK
        uuid rankingCategoryId FK
        uuid playerId FK
        decimal points "rebuildable from RANKING_POINTS_EVENT"
    }
```
