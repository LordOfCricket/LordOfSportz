# LOC Web Authentication E2E Test Plan

## Architecture Overview

### Auth State Management
- **Context**: `AuthContext.jsx` provides auth state (user, player, status, mfa)
- **Initial State**: 'loading' → calls `/auth/me` on app mount
- **Session**: HttpOnly cookies only, no JWT in localStorage
- **Interceptor**: 401 on non-/auth/me endpoints triggers `loc:session-expired` event

### Authentication Flows
1. **OTP Login**: sendOtp → verifyOtp
2. **Password Login**: loginWithPassword (email/phone + password)
3. **Signup**: sendSignupCode → verifySignupCode → createAccount
4. **Password Reset**: forgotPassword → resetPassword
5. **Password Change** (authenticated): changePassword
6. **Logout**: logout clears session & state
7. **Session Restoration**: /auth/me on mount

### Route Protection
- **RequireAuth**: status must be 'authenticated', else redirect to /login
- **RequireStaffRole**: checks user.role === 'staff' AND user.staff_role in allow list
- **RequireApprovedUmpire**: checks umpire request status === 'approved'
- **RequireGroundOwner**: fetches ground list, ensures at least one owned
- **RequireGroundStaff**: just checks auth (server-side validates membership)
- **RequireMfaVerified**: if mfa.required, mfa.verified must be true, else redirect to /security/mfa-verify
- **RequirePrivilegedAccount**: used by /security page (staff only)

### Role Matrix (Expected)
- **SUPER_ADMIN**: user.role === 'staff' && user.staff_role === 'super_admin'
- **GROUND_OWNER**: user.role === 'player' with ground_users entry
- **GROUND_ADMIN**: user.role === 'staff' && user.staff_role in [ground_admin, canteen_staff]
- **UMPIRE**: user.role === 'player' && player_type === 'umpire' && umpire_requests.status === 'approved'
- **PLAYER**: user.role === 'player'

## Test Phases

### Phase 1: Architecture Audit ✓
- [x] Auth context provider structure
- [x] Route guards implementation
- [x] API contracts
- [x] Session handling

### Phase 2: Initial Load / Session Restoration
- [ ] Fresh browser: /auth/me returns 401
- [ ] After login: /auth/me returns 200 with user
- [ ] Session expires: next request 401 triggers event
- [ ] Hard refresh: session preserved if cookie valid
- [ ] Direct deep link while logged out: redirects to /login
- [ ] Direct deep link while logged in: loads protected content

### Phase 3: Login Flow
- [ ] Valid OTP credentials
- [ ] Invalid OTP code
- [ ] Valid password credentials
- [ ] Invalid password
- [ ] Empty fields validation
- [ ] Non-existent account
- [ ] Loading state during verification
- [ ] State transitions on success

### Phase 4: Signup Flow
- [ ] Send code for registration
- [ ] Verify code
- [ ] Create account with full data
- [ ] Account creation validation
- [ ] Duplicate identifier rejection
- [ ] Form validation

### Phase 5: Password Reset
- [ ] Send reset code
- [ ] Verify reset code
- [ ] Set new password
- [ ] Invalid code handling
- [ ] Password validation
- [ ] No auto-login after reset

### Phase 6: Authenticated Actions
- [ ] Change password when already logged in
- [ ] Force password change screen
- [ ] Role selection (selectRole)
- [ ] Player type selection (selectPlayerType)
- [ ] MFA status in /auth/me

### Phase 7: Role-Based Access
- [ ] SUPER_ADMIN can access /admin/dashboard
- [ ] Non-admin cannot access /admin/dashboard
- [ ] GROUND_OWNER can access /ground-owner/dashboard
- [ ] Non-owner redirects to /register-ground
- [ ] UMPIRE can access /umpire/dashboard
- [ ] Non-approved umpire redirects to /umpire
- [ ] PLAYER can access /player/dashboard
- [ ] Cross-role blocked access

### Phase 8: MFA Gates
- [ ] Super admin without MFA verification redirects to /security/mfa-verify
- [ ] Correct mfa redirect state preservation
- [ ] Ground owner with force=true requires MFA
- [ ] Non-required users skip MFA gate
- [ ] MFA status refresh

### Phase 9: Session Expiry
- [ ] Mid-request 401 triggers loc:session-expired event
- [ ] Event handler clears auth state
- [ ] RequireAuth detects unauthenticated status
- [ ] User redirected to /login
- [ ] Subsequent protected requests fail cleanly

### Phase 10: Logout
- [ ] Logout clears user state
- [ ] Logout clears mfa state
- [ ] Logout clears player state
- [ ] Session revoked server-side
- [ ] Subsequent protected URL redirects to /login
- [ ] Browser back button doesn't expose protected data
- [ ] Query cache cleared appropriately

### Phase 11: IDOR Prevention
- [ ] User cannot access another user's profile via URL param
- [ ] User cannot access another user's booking
- [ ] Backend 403 on unauthorized resource access
- [ ] Frontend doesn't assume route params mean authorization

### Phase 12: Multi-Tab Behavior
- [ ] Tab A: Logged in
- [ ] Tab B: Logout
- [ ] Tab A: Next API request returns 401
- [ ] Tab A: Detects session expired
- [ ] Tab A: Redirects to /login
- [ ] Both tabs consistent

### Phase 13: Network Error Handling
- [ ] 401 on non-/auth/me: triggers session-expired
- [ ] 401 on /auth/me: handled by AuthContext (expected)
- [ ] 403: doesn't trigger logout (only 401 does)
- [ ] 5xx: doesn't log user out
- [ ] Timeout: doesn't log user out
- [ ] 429: doesn't log user out

### Phase 14: Security Audit
- [ ] No hardcoded credentials in source
- [ ] No tokens in localStorage
- [ ] No debug OTP bypasses
- [ ] No raw backend errors exposed
- [ ] No console.log of sensitive data
- [ ] Session cookie attributes (HttpOnly, Secure, SameSite)
- [ ] No open redirects
- [ ] No unsafe role detection

### Phase 15: State Consistency
- [ ] After login: user + status + mfa all consistent
- [ ] After logout: user=null, status=unauthenticated, mfa=DEFAULT
- [ ] Role changes: user.role updated
- [ ] Player refresh: player state synced
- [ ] No stale auth state across tabs

### Phase 16: Edge Cases
- [ ] Login while already authenticated
- [ ] Logout while offline (still clears state)
- [ ] /auth/me called before initialized
- [ ] Rapid state changes
- [ ] Browser back from login screen
- [ ] Force password change blocks all other routes
- [ ] Registration entry page public, but form requires auth

