# 03 — Authentication & Login Flow

Full detail: see [../LOC_COMPLETE_DATA_FLOW.md § D](../LOC_COMPLETE_DATA_FLOW.md#d-authentication--login-flow).

LOC's primary auth mechanism is an **httpOnly signed session cookie**, not a bearer JWT returned in the response body. A legacy JWT bearer-token path (`signToken`/`verifyToken`) still exists in `requireAuth` but nothing in the active login flow calls `signToken` anymore — kept only for integration-test fixtures / old tokens.

## Register / OTP Login

```mermaid
flowchart TD
    A["User enters email/phone"] --> B["POST /api/auth/send-otp"]
    B --> C["otp.service.js requestOtp()"]
    C --> D[("otp_codes\nINSERT: identifier, purpose='LOGIN',\notp_hash (hashed, never plaintext)")]
    C --> E["SendGrid (email) or\nTwilio Verify (SMS)"]
    E --> F["User receives code"]
    F --> G["POST /api/auth/verify-otp\n{identifier, code}"]
    G --> H["otpAuth.service.js verifyLoginOtp()"]
    H --> I[("otp_codes\nUPDATE status='VERIFIED'")]
    H --> J[("users\nSELECT by identifier\n(creates row if REGISTER_* purpose)")]
    H --> K[("sessions\nINSERT token_hash, expires_at")]
    K --> L["Set-Cookie: loc_session\n(httpOnly, signed, SameSite=Lax)"]
    L --> M["Response: { user }\n(no token in body)"]
```

`POST /api/auth/register/player` and `/register/umpire` stage an OTP with `purpose='REGISTER_PLAYER'`/`'REGISTER_UMPIRE'`; the actual `users` row is created inside `verify-otp` once the code is confirmed (a `REGISTER_UMPIRE` success also creates a pending `umpire_requests` row).

## Password Login

```mermaid
flowchart TD
    A["User enters identifier + password"] --> B["POST /api/auth/login-password\n{identifier, password}"]
    B --> C["otpAuth.service.js loginWithPassword()"]
    C --> D[("users\nSELECT password_hash by identifier")]
    D --> E["bcrypt.compare(password, password_hash)\n(always runs against a dummy hash\nif no account exists — timing-safe)"]
    E -->|match| F[("sessions\nINSERT token_hash, expires_at")]
    F --> G["Set-Cookie: loc_session"]
    G --> H["Response: { user }"]
    E -->|no match| I["401 — generic\n'Incorrect email/phone or password.'\n(never reveals which part was wrong)"]
```

## Authenticated Request (`requireAuth`)

```mermaid
flowchart TD
    A["Incoming request"] --> B{"Signed cookie\nloc_session present?"}
    B -->|yes| C["Hash token (SHA-256)\nSELECT sessions WHERE token_hash=?\nAND revoked_at IS NULL AND expires_at > NOW()"]
    C -->|valid| D["Load req.user via findUserById()\n(same shared query, both paths)"]
    B -->|no| E["Authorization: Bearer <jwt>?\n(legacy path)"]
    E -->|valid jwt| D
    D --> F{"user.status == 'ACTIVE'?"}
    F -->|yes| G["Proceed to controller"]
    F -->|no| H["401 — account not active"]
```

## Logout / Password Reset

```mermaid
flowchart TD
    A["POST /api/auth/logout"] --> B[("sessions.revoked_at = NOW()\nfor this token_hash only")]
    C["POST /api/auth/reset-password\n(code + newPassword)"] --> D[("users.password_hash UPDATE")]
    D --> E[("sessions — revokeAllSessionsForUser\n(every session for this user)")]
    F["POST /api/auth/change-password\n(while logged in)"] --> G[("users.password_hash UPDATE")]
    G --> H[("sessions — revokeAllSessionsForUserExceptCurrent\n(every OTHER session)")]
```

## Key facts (verified in code)

| Question | Answer |
|---|---|
| Password hashing | `bcryptjs`, cost factor `10` |
| Password ever in plaintext/logs? | No — `users.password_hash` never leaves the DB layer; failures log a masked identifier only |
| OTP storage | `otp_codes.otp_hash` — hashed, single-use, purpose-scoped |
| Token model | No JWT refresh pair. Random 256-bit session token generated per login; only its SHA-256 hash stored (`sessions.token_hash`); raw token lives only in the httpOnly cookie |
| Cookie | `loc_session` — httpOnly, `secure` in prod, `SameSite=Lax`, signed with `SESSION_COOKIE_SECRET` |
| Session lifetime | `SESSION_TTL_DAYS` env var (default 30 days) |
| Revocation mechanism | `sessions.revoked_at IS NOT NULL` — no separate blacklist table |
| Current-user resolution | `middlewares/auth.js#requireAuth` — cookie branch (primary) or legacy JWT bearer branch, both converge on `findUserById()` |
| Role storage | `users.role` + `users.player_type` (platform) · `users.staff_role_id → staff_roles.name` (staff sub-role) · `ground_users.role` (per-ground role) |
| MFA (WebAuthn/TOTP/step-up) | Fully implemented (tables, routes, encryption) — **but `mfaState.service.js#computeMfaVerified()` is hardcoded to `return true`**. Enforcement is currently bypassed, per an explicit code comment. |
| Relevant env vars (names only) | `JWT_SECRET`, `SESSION_COOKIE_SECRET`, `DATABASE_URL`, `PG_*`, `MFA_ENCRYPTION_KEY`, `WEBAUTHN_RP_ID/RP_NAME/ORIGIN`, `SESSION_TTL_DAYS`, `OTP_LENGTH`, `OTP_TTL_MINUTES`, `TWILIO_*`, `SENDGRID_*`, `CLOUDINARY_*` |

No secrets/keys are shown anywhere in this documentation — only column and env var **names**.
