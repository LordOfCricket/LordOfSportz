# Lord Of Cricket — Mobile Development Guide

## Overview

This is the React Native + Expo mobile application for the Lord Of Cricket platform. It serves as another client for the existing LOC backend API, alongside the web application.

## Technology Stack

- **Framework**: React Native + Expo (SDK 57)
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand (minimal global state) + TanStack Query (server state)
- **HTTP Client**: Axios (with session cookie support)
- **Storage**: AsyncStorage (for cookies), Expo SecureStore (for sensitive data)
- **UI Styling**: React Native StyleSheet

## Setup

### Prerequisites

- Node.js >= 20.0.0
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- For Android: Android Studio or Android SDK
- For iOS: Xcode (macOS only)

### Installation

```bash
cd mobile
npm install
```

### Environment Configuration

The app reads API configuration from environment variables:

```bash
# Copy and customize
cp .env.example .env.local

# Edit .env.local with your API URL
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

**Note**: For local development on physical devices, replace `localhost` with your machine's IP:
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api
```

## Running the App

### Development Server

Start the Expo development server:

```bash
npm start
```

This opens an interactive menu where you can choose:
- `a` — Run on Android emulator or connected device
- `i` — Run on iOS simulator (macOS only)
- `w` — Run in web browser (for testing navigation only, not recommended for feature testing)
- Press `j` to open debugger

### Android

Connect an Android device via USB or start an Android emulator, then:

```bash
npm run android
```

### iOS

On macOS with Xcode installed:

```bash
npm run ios
```

### Web (Testing Only)

```bash
npm run web
```

## Project Structure

```
mobile/
├── app/                      # Expo Router routes (file-based routing)
│   ├── _layout.tsx          # Root layout
│   ├── index.tsx            # Root screen (redirects to auth/tabs)
│   ├── (auth)/              # Authentication screens
│   │   ├── _layout.tsx
│   │   ├── login.tsx        # OTP login screen
│   │   └── otp-verify.tsx   # OTP verification screen
│   └── (tabs)/              # Main authenticated screens
│       ├── _layout.tsx      # Tab navigation
│       ├── home.tsx         # Home/dashboard
│       ├── matches.tsx      # Matches discovery (placeholder)
│       ├── teams.tsx        # Teams (placeholder)
│       ├── grounds.tsx      # Grounds discovery (placeholder)
│       └── profile.tsx      # User profile & settings
│
├── src/
│   ├── services/            # API clients
│   │   ├── api.ts          # Axios client with cookie handling
│   │   ├── authApi.ts      # Auth API methods
│   │   └── playerApi.ts    # Player API methods
│   │
│   ├── store/              # Zustand state management
│   │   └── authStore.ts    # Authentication state
│   │
│   ├── hooks/              # Custom React hooks
│   │   └── useAuth.ts      # Auth store hook
│   │
│   ├── types/              # TypeScript types
│   │   └── index.ts
│   │
│   ├── constants/          # App constants
│   │   └── colors.ts       # Design system (colors, typography, spacing)
│   │
│   └── utils/              # Utility functions
│       └── errors.ts       # Error handling helpers
│
├── assets/                  # Images, fonts, icons
├── app.json                # Expo configuration
├── package.json
├── tsconfig.json
└── DEVELOPMENT.md          # This file
```

## Authentication Flow

The mobile app uses the **same authentication system** as the web application:

1. **OTP Login** (primary path):
   ```
   User enters email/phone
         ↓
   App requests OTP via POST /auth/send-otp
         ↓
   Backend sends OTP via email/SMS
         ↓
   User enters OTP code
         ↓
   App verifies OTP via POST /auth/verify-otp
         ↓
   Backend sets HttpOnly session cookie
         ↓
   Axios automatically includes cookie in future requests
   ```

2. **Session Management**:
   - The backend sets an HttpOnly session cookie
   - Mobile app stores cookie in AsyncStorage
   - Axios interceptors automatically attach the cookie to requests
   - On logout, both cookie and local session state are cleared

3. **MFA** (Phase 6):
   - For privileged accounts (ground_owner, super_admin)
   - Currently read-only in Phase 1 (UI support prepared)

## API Client Usage

The `ApiClient` (`src/services/api.ts`) handles:
- Request/response interceptors
- Session cookie management
- Error handling
- Base URL configuration

### Example API Call

```typescript
import * as authApi from '@/src/services/authApi'

// Send OTP
await authApi.sendOtp('user@example.com')

// Verify OTP
const user = await authApi.verifyOtp('user@example.com', '123456')

// Fetch current user
const { user, mfa } = await authApi.fetchMe()

// Logout
await authApi.logout()
```

## State Management

Uses **Zustand** for authentication state:

```typescript
import { useAuthStore } from '@/src/store/authStore'

function MyComponent() {
  const { user, status, logout, verifyOtp } = useAuthStore()

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated') return <LoginScreen />

  return <AuthenticatedScreen user={user} />
}
```

## Design System

The app includes a centralized design system in `src/constants/colors.ts`:

```typescript
import { Colors, Typography, Spacing, BorderRadius } from '@/src/constants/colors'

// Colors
Colors.primary          // #0066FF
Colors.error            // #FF3B30
Colors.gray[500]        // #9E9E9E

// Typography
Typography.fontSize.base      // 16
Typography.fontWeight.semibold // '600'

// Spacing
Spacing.md              // 12
Spacing.lg              // 16

// Borders
BorderRadius.md         // 8
```

**All new components should use these tokens**, not hardcoded values.

## Important: Local Development with Backend

By default, the app points to `http://localhost:3000/api`.

**From a physical device**, `localhost` is unreachable. Instead:

1. Find your machine's local IP:
   ```bash
   # macOS/Linux
   ifconfig | grep inet

   # Windows
   ipconfig
   ```

2. Update `.env.local`:
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api
   ```

3. Restart the app

## Debugging

### React Native Debugger

1. Start the app: `npm start`
2. Press `j` to open the debugger
3. Use Chrome DevTools for console, network inspection

### Logs

View console logs:
```bash
npm start
# Press `l` for logs
```

### Common Issues

- **"Cannot connect to API"**: Check `.env.local` and ensure backend is running
- **"Session expired"**: Try logging out and back in
- **Cookie not being set**: Check browser DevTools → Application → Cookies on web, or AsyncStorage in debugger on mobile

## Phase 1 Scope (Current)

✅ Authentication foundation (OTP, password login, logout)
✅ Auth state management
✅ Navigation structure (auth & main tabs)
✅ API client with session handling
✅ Home screen placeholder
✅ Profile screen with logout
✅ Design system tokens

## Future Phases

Phase 2+:
- Match discovery & details
- Team management
- Ground booking
- Player profiles & stats
- Live scoring
- Notifications
- Push notifications
- Deep linking
- Offline support
- Advanced filtering
- Search functionality

## Testing

### Manual Testing Checklist

- [ ] Splash screen loads
- [ ] Login screen appears
- [ ] OTP request works
- [ ] OTP verification works
- [ ] Redirect to home after login
- [ ] Home screen displays user name
- [ ] Tab navigation works
- [ ] Profile shows user info
- [ ] Logout works
- [ ] Redirect to login after logout
- [ ] Back to login from OTP screen works

## Architecture Decisions

### Why Session Cookies on Mobile?

Mobile browsers and React Native apps can handle HTTP cookies similarly to web browsers. The LOC backend uses HttpOnly cookies for security (prevent XSS attacks). The mobile app:
1. Stores the cookie in AsyncStorage (not secure enough for sensitive data)
2. Re-attaches it in axios interceptors
3. This mirrors the web app's approach while respecting the backend's design

For more sensitive data (future: MFA recovery codes), use `expo-secure-store`.

### Why Zustand Over Redux/MobX?

- Minimal boilerplate
- Built-in subscriptions
- Works great with hooks
- Smaller bundle size
- Phase 1 doesn't need complex state patterns

### Why TanStack Query (Prepared)?

Currently not used in Phase 1, but prepared for Phase 2+:
- Automatic caching
- Background sync
- Optimistic updates
- Offline support
- Built-in loading/error states

## Performance Notes

- App uses React Compiler (Expo 57)
- Memoization is automatic for most components
- Code-splitting happens automatically via Expo Router
- Images should be optimized before adding

## Security Checklist

- ✅ Secrets not committed (`.env.local` in .gitignore)
- ✅ HTTPS required for production API
- ✅ HttpOnly cookies prevent XSS
- ✅ CORS properly configured on backend
- ✅ Rate limiting on auth endpoints (backend)

## Deployment

Mobile app deployment is handled separately (Phase 2+):
- iOS: TestFlight → App Store
- Android: Internal testing → Google Play Store

See deployment guide (future).

## Getting Help

- Check Expo docs: https://docs.expo.dev/versions/v57.0.0/
- LOC API docs: See `docs/API.md` in the root project
- GitHub issues: https://github.com/anthropics/lord-of-cricket

## Code Conventions

- Use TypeScript strict mode
- Prefer functional components
- Use hooks for state management
- Follow eslint rules: `npm run lint`
- Keep components under 300 lines
- Extract reusable logic to hooks
- Use descriptive variable names
- No commented-out code

## Performance Profiling

Profile startup time:
```bash
npm start
# Press `p` in debugger console
```

## Contributing

When adding new features:
1. Create components in `src/components/` (reusable)
2. Keep screens simple, move logic to services/hooks
3. Use design system tokens
4. Add TypeScript types
5. Test on both Android and iOS (if possible)
6. Update this guide if adding new patterns
