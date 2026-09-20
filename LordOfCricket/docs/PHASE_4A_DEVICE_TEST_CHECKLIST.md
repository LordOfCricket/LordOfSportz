# Phase 4A — Device Test Checklist

**Purpose:** Systematic validation checklist for Phase 4A.2 physical device & live backend testing.

**Status:** READY FOR PHYSICAL DEVICE TESTING

**Date:** 2026-08-19

---

## Environment Setup

Before testing begins, verify:

- [ ] Backend server reachable at configured `EXPO_PUBLIC_API_URL`
- [ ] Backend has valid test user data
- [ ] Socket.IO server running and accessible
- [ ] Database has cricket match data (live or test match)
- [ ] `.env.local` updated with reachable backend URL
- [ ] iOS privacy descriptions added to app.json (if testing iOS)
- [ ] Device developer mode enabled
- [ ] Device connected via USB with adb/Xcode
- [ ] Expo CLI authenticated (`expo login`)

---

## Android Physical Device Testing

### Installation & Launch

- [ ] `expo start --android` launches successfully
- [ ] App appears on Android device
- [ ] Splash screen displays correctly
- [ ] App does not crash on startup
- [ ] No permission errors on first launch
- [ ] UI renders without obvious layout issues

### Authentication

- [ ] Login screen appears
- [ ] OTP input works (6-digit entry)
- [ ] Backend OTP verification works
- [ ] Session established after OTP verification
- [ ] User data loads (name, role visible)
- [ ] Kill and restart app
- [ ] Session restored (not back to login)
- [ ] Logout clears session
- [ ] Back to login screen after logout

### Navigation & Home

- [ ] Home screen loads
- [ ] Live/upcoming/completed match cards display
- [ ] Tab navigation works (all 5 tabs)
- [ ] Pull-to-refresh works on home
- [ ] No crashes during navigation

### Matches

- [ ] Matches tab shows match list
- [ ] Can tap on a match
- [ ] Match details screen loads
- [ ] HTTP match data displays (teams, score, date)
- [ ] Back navigation works

### Live Match (if available)

- [ ] Open a live match from match details
- [ ] Live indicator shows 🔴 LIVE
- [ ] Socket connects ("Connecting..." briefly)
- [ ] Live score updates appear
- [ ] Current players visible (striker/bowler)
- [ ] Recent deliveries show
- [ ] Commentary loads and streams
- [ ] New commentary entries appear in real-time
- [ ] Scores match web app for same match

### Network Interruption

- [ ] While watching live match
- [ ] Disable Wi-Fi
- [ ] Status changes to 🟡 Reconnecting...
- [ ] Last known score remains visible
- [ ] No UI crash
- [ ] Enable Wi-Fi
- [ ] Socket reconnects
- [ ] Back to 🔴 LIVE
- [ ] New updates arrive
- [ ] No duplicate commentary
- [ ] No duplicate scores

### Background/Foreground

- [ ] Start live match
- [ ] Press home (background app)
- [ ] Wait 10 seconds
- [ ] Return to app
- [ ] Match state preserved
- [ ] Socket still connected
- [ ] Updates continue

### Location (Grounds)

- [ ] Tap Grounds tab
- [ ] Permission prompt appears
- [ ] Grant location permission
- [ ] Nearby grounds load
- [ ] Deny permission
- [ ] Fallback message appears
- [ ] No crash

### Teams

- [ ] Teams tab shows team list
- [ ] Tap team
- [ ] Team details load
- [ ] Squad displays

### Player Profile

- [ ] Profile tab shows user info
- [ ] Player data displays (if player role)
- [ ] All stats visible

### UI/UX Review

- [ ] Text readable (not too small)
- [ ] Buttons tappable (large enough)
- [ ] No text clipping
- [ ] No layout overflow
- [ ] Scrolling smooth
- [ ] Long team names handled
- [ ] Long player names handled
- [ ] Status bar not covered
- [ ] Navigation bar not covered
- [ ] Safe areas respected

### Performance

- [ ] No obvious stuttering
- [ ] Scrolling smooth
- [ ] Loading states appear appropriately
- [ ] No excessive CPU usage (check Android monitor)
- [ ] No excessive memory growth (check RAM usage)

---

## iOS Physical Device Testing (if available)

### Installation & Launch

- [ ] App builds and installs via Xcode
- [ ] App launches successfully
- [ ] Splash screen displays
- [ ] No permission errors
- [ ] UI renders correctly

### Authentication

- [ ] Login flow works
- [ ] OTP entry works
- [ ] Session established
- [ ] Session persists after restart
- [ ] Logout works

### Live Match

- [ ] Live match opens
- [ ] Socket connects
- [ ] Score updates real-time
- [ ] Commentary streams
- [ ] Matches web app data

### Network Interruption

- [ ] Airplane mode toggle test
- [ ] Reconnection works
- [ ] No duplicates
- [ ] UI remains responsive

### Background/Foreground

- [ ] Home button backgrounding works
- [ ] Return foreground works
- [ ] Socket state preserved

### Navigation

- [ ] All tabs work
- [ ] Back navigation works
- [ ] No crashes

### UI/Layout

- [ ] Notch/safe area handled
- [ ] Home indicator space respected
- [ ] Status bar not overlapped
- [ ] All text readable
- [ ] Scrolling smooth

---

## iOS Simulator Testing (if physical device unavailable)

- [ ] Build succeeds
- [ ] App launches in simulator
- [ ] Basic navigation works
- [ ] No obvious runtime errors
- [ ] Network calls succeed (if backend reachable)
- [ ] Socket.IO connects (if backend reachable)

**Note:** Simulator testing is useful for basic validation but does not replace physical device testing for production release.

---

## Live Backend Integration

### Verify Connection

- [ ] Backend server online and reachable
- [ ] API endpoints respond (test with curl/Postman)
- [ ] Socket.IO server online
- [ ] Can establish Socket connection

### Authentication

- [ ] `POST /auth/request-otp` responds
- [ ] `POST /auth/verify-otp` works
- [ ] Session cookie returned
- [ ] `GET /auth/me` returns user data

### Match Data

- [ ] `GET /matches/discover` returns data
- [ ] `GET /matches/:id` returns match summary
- [ ] `GET /matches/:id/live-state` returns live state (if live match)
- [ ] `GET /matches/:id/commentary` returns commentary
- [ ] Socket events emit (join-match → match:state, match:commentary)

### Live Match Verification

If a real live match is available:

- [ ] Score on mobile matches web app
- [ ] Commentary matches web app
- [ ] Players match web app
- [ ] Deliveries match web app

---

## Network Scenarios

### Scenario 1: Stable Network

- [ ] Normal operation works
- [ ] All features accessible
- [ ] No false errors

### Scenario 2: Intermittent Network

- [ ] Disable/enable Wi-Fi several times
- [ ] App does not crash
- [ ] Reconnection attempted
- [ ] No infinite loops
- [ ] No duplicate data

### Scenario 3: Slow Network

- [ ] Reduce network speed (if possible)
- [ ] App remains responsive
- [ ] Loading states appear
- [ ] No timeout crashes
- [ ] Data eventually loads

### Scenario 4: Network Timeout

- [ ] Background app for extended period
- [ ] Return with poor connection
- [ ] App recovers gracefully
- [ ] Reconnection attempted

---

## Data Verification

### Match Details Match Web App

For a live match, verify on both web and mobile:

| Field | Web | Mobile | Match? |
|-------|-----|--------|--------|
| Teams | | | ✓/✗ |
| Score | | | ✓/✗ |
| Wickets | | | ✓/✗ |
| Overs | | | ✓/✗ |
| Striker | | | ✓/✗ |
| Bowler | | | ✓/✗ |
| Recent deliveries | | | ✓/✗ |
| Commentary | | | ✓/✗ |

---

## Performance Measurements

### During Live Match

Record (use device profiler if available):

- CPU usage: _________%
- Memory usage: _________ MB
- Battery drain: _________ %/hour
- Frames per second: _________ fps
- Socket event latency: _________ ms

### Acceptable Ranges

- CPU: < 50% during active scoring
- Memory: < 100 MB baseline
- Battery: < 15% drain/hour
- FPS: > 50 fps during updates
- Latency: < 500 ms end-to-end

---

## Issues Found

For every issue found, record:

### Issue #1

**Category:** [ ] Crash [ ] Network [ ] UI [ ] Auth [ ] Socket [ ] Other

**Severity:** [ ] Critical [ ] High [ ] Medium [ ] Low

**Reproduction:**
```
Steps to reproduce:
1. ...
2. ...
3. ...
```

**Expected:** _______________

**Actual:** _______________

**Root Cause:** _______________

**Fix Required:** YES / NO

---

## Sign-Off

- [ ] Android testing completed: _______
- [ ] iOS testing completed: _______
- [ ] Live backend validation: _______
- [ ] Network testing: _______
- [ ] Performance acceptable: _______
- [ ] No critical issues: _______
- [ ] All findings documented: _______

---

## Final Verdict

Based on testing, the application is ready for:

- [ ] Production release
- [ ] Production with known limitations (list below)
- [ ] Further hardening required (list below)

### Known Limitations (if any):

1. ...
2. ...

### Requires Fixes Before Production (if any):

1. ...
2. ...

---

**Testing Date:** ______________

**Tested By:** ______________

**Device(s):** ______________

**Backend Environment:** ______________

**Result:** ______________

---

## Next Steps

After device testing:

1. Document all findings in `PHASE_4A2_DEVICE_VALIDATION_REPORT.md`
2. Fix critical issues
3. Retest critical fixes
4. Proceed to Phase 4B (Booking/Payment) if approved

---

**Checklist Version:** 1.0  
**Created:** 2026-08-19  
**Status:** READY FOR USE
