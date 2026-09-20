# Lord Of Cricket — Mobile Application

## Overview

The Lord Of Cricket mobile application is a **React Native + Expo** application that serves as another client for the existing LOC platform. It reuses the existing backend API and database, extending the LOC experience to mobile devices (iOS and Android).

This is **NOT** a separate application or backend. It is another client of the single, unified LOC platform.

## Architecture

```
┌─────────────────┐
│  LOC Web        │
│  (React + Vite) │
└────────┬────────┘
         │
         │ Uses existing API
         │
┌────────▼────────────────────┐
│  LOC Backend                │
│  (Express.js + PostgreSQL)  │
└────────┬────────────────────┘
         │
         │ Uses existing API
         │
┌────────▼────────────────┐
│  LOC Mobile             │
│  (React Native + Expo)  │
└─────────────────────────┘
```

All three clients share:
- **Same authentication system** (OTP + session cookies)
- **Same authorization rules** (RBAC)
- **Same database** (PostgreSQL)
- **Same APIs** (Express REST)
- **Same business logic**

## Quick Start

### Development

```bash
# Navigate to mobile directory
cd mobile

# Install dependencies (done automatically by create-expo-app)
npm install

# Start development server
npm start

# Choose platform:
# a - Android
# i - iOS (macOS only)
# w - Web (testing only)
```

For detailed setup instructions, see [mobile/DEVELOPMENT.md](./mobile/DEVELOPMENT.md).

### Local API Connection

By default, the mobile app tries to connect to `http://localhost:3000/api`.

If running on a **physical device**, update `.env.local`:

```bash
cd mobile
cat > .env.local << 'EOF'
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api
EOF
```

Replace `192.168.1.100` with your machine's local IP address.

## Project Structure

```
mobile/
├── app/                    # Expo Router (file-based routing)
│   ├── _layout.tsx        # Root layout
│   ├── (auth)/            # Auth screens
│   └── (tabs)/            # Main app screens
│
├── src/
│   ├── services/          # API clients
│   │   ├── api.ts         # HTTP client
│   │   ├── authApi.ts
│   │   ├── playerApi.ts
│   │   ├── matchApi.ts
│   │   ├── teamApi.ts
│   │   └── groundApi.ts
│   │
│   ├── store/             # Zustand state
│   │   └── authStore.ts
│   │
│   ├── hooks/             # Custom hooks
│   ├── types/             # TypeScript types
│   ├── constants/         # Colors, spacing, etc.
│   └── utils/             # Helper functions
│
└── DEVELOPMENT.md         # Development guide
```

## Current Features (Phase 1)

- ✅ OTP login (email/phone)
- ✅ Password login
- ✅ Session-based authentication
- ✅ Logout
- ✅ Home screen (dashboard)
- ✅ Profile screen
- ✅ Role selection
- ✅ Navigation foundation

## Planned Features (Phase 2+)

- Match discovery & details
- Team management & search
- Ground discovery & booking
- Player profiles & stats
- Live scoring interface
- Match availability/RSVP
- Ground staff features
- Notifications
- Push notifications
- Deep linking
- Offline support
- Advanced filtering
- Search functionality

## API Reuse

The mobile app reuses existing LOC backend APIs without modification. No separate mobile-specific endpoints were created.

### Example: Authentication

**Web app** (`client/src/services/authApi.js`):
```javascript
export async function sendOtp(identifier) {
  const response = await api.post('/auth/send-otp', { identifier })
  return response.data
}
```

**Mobile app** (`mobile/src/services/authApi.ts`):
```typescript
export async function sendOtp(identifier: string) {
  const response = await api.post('/auth/send-otp', { identifier })
  return response.data
}
```

Both use the same `POST /auth/send-otp` endpoint. This design ensures:
- No API duplication
- Consistency across clients
- Lower backend maintenance burden
- Easier feature rollout

## Authentication on Mobile

The mobile app uses the same **session-cookie authentication** as the web app:

1. User submits email/phone
2. Backend sends OTP via email/SMS
3. User enters OTP code
4. Backend verifies and **sets an HttpOnly session cookie**
5. Mobile app stores cookie in `AsyncStorage`
6. Axios automatically attaches cookie to future requests
7. On logout, cookie is cleared

This approach works identically on mobile and web, delegating security to the backend.

## Development Workflow

### Starting the Full Stack

Start backend + web + mobile together:

```bash
# From root directory
npm run dev:all
```

Or start individually:

```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Web
cd client && npm run dev

# Terminal 3: Mobile
cd mobile && npm start
```

### Adding a New Feature

Example: Adding a "matches" feature

1. **Backend** (if needed):
   - Verify API endpoint exists (e.g., `GET /matches`)
   - No changes needed if already implemented

2. **Web app** (React):
   - Create components and pages
   - Call existing API via axios

3. **Mobile app** (React Native):
   - Create screens and components
   - Call same API via axios
   - Use the same styling approach

Both clients use the exact same API, so you only implement once on the backend.

### Code Quality

```bash
cd mobile

# Lint TypeScript
npm run lint

# Format with Prettier (if configured)
npx prettier --write src/

# Type checking
npx tsc --noEmit
```

## Design System

The mobile app uses a centralized design system (`src/constants/colors.ts`) with:
- Brand colors
- Typography scales
- Spacing tokens
- Border radius values
- Shadow definitions

**All new UI should use these tokens**, not hardcoded values.

## State Management Strategy

- **Authentication**: Zustand (global, persistent)
- **Server data** (Phase 2+): TanStack Query (automatic caching/sync)
- **Component state**: React hooks (local to component)

This layered approach keeps the store lean and focused.

## Testing the App

Manual testing checklist:

- [ ] App starts, shows splash screen
- [ ] Login screen appears
- [ ] OTP request succeeds
- [ ] OTP verification succeeds
- [ ] Redirected to home after login
- [ ] Tab navigation works (home, matches, teams, grounds, profile)
- [ ] Profile screen displays user info
- [ ] Logout works
- [ ] Redirected to login after logout
- [ ] Going back from OTP screen returns to login

## Important: No Backend Changes

The mobile app **does not modify the backend**. All backend APIs were designed to work with web and mobile clients simultaneously.

If an API seems incompatible with mobile, investigate before modifying:
- Is there an existing API that does the same thing?
- Can the existing API be used differently?
- Only if absolutely necessary, consider a small, backward-compatible change

## Environment Configuration

The app reads from environment variables:

```bash
EXPO_PUBLIC_API_URL         # Backend API base URL
EXPO_PUBLIC_APP_ENV        # environment: development/staging/production
```

Create `.env.local` (never commit):

```bash
EXPO_PUBLIC_API_URL=http://localhost:3000/api
EXPO_PUBLIC_APP_ENV=development
```

## Debugging

### Log Viewer

```bash
npm start
# Press 'l' to view logs
```

### React Native Debugger

```bash
npm start
# Press 'j' to open debugger
# Use Chrome DevTools for console, network inspection
```

## Build & Release (Future)

See `mobile/DEVELOPMENT.md` for deployment instructions (Phase 2+).

## Known Limitations (Phase 1)

- Some features are placeholders (matches, teams, grounds)
- No offline support (Phase 2+)
- No push notifications (Phase 2+)
- No deep linking (Phase 2+)
- MFA only read-only (full support Phase 2+)

## Performance

The app uses:
- React Compiler (Expo 57) for automatic memoization
- Expo Router for code-splitting
- Zustand for minimal state re-renders
- TanStack Query ready for Phase 2+ (caching, prefetching)

## Security

- ✅ Secrets not in code (`.env.local` in gitignore)
- ✅ HttpOnly cookies prevent XSS
- ✅ HTTPS required for production
- ✅ Same rate limiting as web app
- ✅ Backend authorization always enforced

## Browser Compatibility (Web Dev)

The app also runs on web via `npm run web`. This is **for debugging only**, not a production target. Use the web app (`client/`) for actual web support.

## Contributing

When modifying the mobile app:
1. Follow the existing structure (services, store, screens)
2. Use design system tokens
3. Add TypeScript types
4. Use descriptive naming
5. Keep components small (<300 lines)
6. Test on both Android and iOS (if possible)

## Resources

- [Expo Documentation](https://docs.expo.dev/versions/v57.0.0/)
- [React Native Docs](https://reactnative.dev/)
- [LOC API Documentation](./docs/API.md)
- [LOC Architecture](./docs/ARCHITECTURE.md)
- [Mobile Development Guide](./mobile/DEVELOPMENT.md)

## Support

For issues or questions:
- Check [mobile/DEVELOPMENT.md](./mobile/DEVELOPMENT.md) for troubleshooting
- Review API docs in [docs/API.md](./docs/API.md)
- Check Expo SDK version in `mobile/app.json` against docs
- Ensure backend is running: `npm run dev`
