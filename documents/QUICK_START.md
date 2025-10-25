# Quick Start Guide - Clerk OAuth Authentication

Get up and running with Clerk OAuth authentication in 5 minutes.

## Prerequisites

- Node.js 16+ installed
- Clerk account with Google OAuth configured
- Access to the web app repository

## Step 1: Install Dependencies (Already Done)

The required dependencies are already installed:
- `keytar` - Secure credential storage
- `@clerk/backend` - Clerk backend SDK
- `jwks-rsa` - JWT verification

## Step 2: Configure Environment Variables

Create `.env.local` in the project root:

```bash
# Copy the example file
cp .env.example .env.local

# Edit with your Clerk credentials
nano .env.local
```

Add your Clerk credentials:

```bash
# Clerk Configuration
CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLERK_FRONTEND_API=clerk.hintify.nexus-v.tech
```

**Where to find these**:
1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Go to **API Keys**
4. Copy the keys

**Important**: Never commit `.env.local` to version control!

## Step 3: Test in Development

```bash
# Start the app
npm run dev
```

The app will start with:
- Main window
- Clerk authentication enabled
- Deep link handlers registered

## Step 4: Test the Authentication Flow

### Option A: Full Flow (Requires Web App)

1. **Click "Sign in with Google"** in the Electron app
2. **Browser opens** to your web app
3. **Sign in** with Google via Clerk
4. **Redirected back** to Electron app
5. **UI updates** to show authenticated state

### Option B: Test Deep Link Manually

1. **Start the Electron app**:
   ```bash
   npm run dev
   ```

2. **Trigger a test deep link** (in a separate terminal):

   **macOS/Linux**:
   ```bash
   open "myapp://auth/callback?token=test-token&state=test-state"
   ```

   **Windows**:
   ```powershell
   Start-Process "myapp://auth/callback?token=test-token&state=test-state"
   ```

3. **Check the console** for:
   - "Processing deep link" message
   - State validation error (expected - test state won't match)

## Step 5: Verify Installation

### Check Protocol Registration

**macOS**:
```bash
# Check if myapp:// is registered
defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist | grep -A 5 myapp
```

**Windows**:
```powershell
# Check registry
Get-ItemProperty -Path "HKCU:\Software\Classes\myapp"
```

**Linux**:
```bash
# Check .desktop file
cat ~/.local/share/applications/hintify.desktop | grep myapp
```

### Check Console Logs

Look for these messages on startup:

```
✅ All services initialized successfully
✅ Protocols registered: hintify://, myapp://
🔄 Clerk authentication restored from storage (if previously logged in)
```

## Step 6: Implement Web App Endpoint

Your web app needs a `/auth/desktop` route. Here's a minimal example:

### Next.js (App Router)

Create `app/auth/desktop/page.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { SignIn } from '@clerk/nextjs';

export default function DesktopAuthPage() {
  const searchParams = useSearchParams();
  const state = searchParams.get('state');
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (isSignedIn && state) {
      getToken().then(token => {
        if (token) {
          window.location.href = `myapp://auth/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
        }
      });
    }
  }, [isSignedIn, state, getToken]);

  if (!isSignedIn) {
    return <SignIn redirectUrl={`/auth/desktop?state=${state}`} />;
  }

  return <div>Redirecting to Hintify...</div>;
}
```

### Configure Clerk Dashboard

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application
3. Go to **Configure** → **Paths**
4. Add to **Allowed redirect URLs**:
   - `myapp://auth/callback`

## Step 7: Test End-to-End

1. **Start Electron app**:
   ```bash
   npm run dev
   ```

2. **Start web app** (in separate terminal):
   ```bash
   cd ../web-app
   npm run dev
   ```

3. **Click "Sign in with Google"** in Electron app

4. **Verify**:
   - Browser opens to web app
   - URL includes `?state=<uuid>`
   - Sign-in form appears
   - After signing in, redirects to `myapp://auth/callback`
   - Electron app receives callback
   - UI updates to show authenticated state

## Troubleshooting

### Issue: "Protocol not registered"

**Solution**:
```bash
# Rebuild the app
npm run build

# Or for development
npm run dev
```

### Issue: "State parameter mismatch"

**Cause**: Authentication took longer than 5 minutes

**Solution**: Try signing in again (generates new state)

### Issue: "Token verification failed"

**Cause**: Wrong Clerk configuration

**Solution**: Check `.env.local` has correct Clerk keys

### Issue: Deep link doesn't launch app

**macOS**: Ensure app is code-signed
```bash
# For development, create self-signed cert
./create-certificate.sh
```

**Windows**: Reinstall the app

**Linux**: Update desktop database
```bash
update-desktop-database ~/.local/share/applications/
```

## Next Steps

### For Development

1. **Enable DevTools**: Already enabled in development mode
2. **Check logs**: Look for 🔐, ✅, ❌ emojis in console
3. **Test edge cases**:
   - Timeout (wait >5 minutes)
   - Cancel authentication
   - Network errors

### For Production

1. **Build the app**:
   ```bash
   npm run build
   ```

2. **Test on all platforms**:
   ```bash
   npm run build-mac
   npm run build-win
   npm run build-linux
   ```

3. **Update web app**:
   - Deploy `/auth/desktop` route
   - Update Clerk redirect URLs for production domain

4. **Test production build**:
   - Install built app
   - Test authentication flow
   - Verify protocol registration

## Useful Commands

```bash
# Development
npm run dev                          # Start in development mode

# Building
npm run build                        # Build for current platform
npm run build-mac                    # Build for macOS
npm run build-win                    # Build for Windows
npm run build-linux                  # Build for Linux

# Testing
npm test                             # Run tests (if configured)

# Debugging
npm run dev -- --development         # Start with extra logging
```

## Console Commands for Testing

Open DevTools in the Electron app and try these:

```javascript
// Check if Clerk auth helper is available
const clerkAuth = require('./clerk-auth-helper').getInstance();

// Get current auth status
clerkAuth.getAuthStatus().then(console.log);

// Check if user is logged in
console.log('Logged in:', clerkAuth.isLoggedIn());

// Get current user
console.log('User:', clerkAuth.getCurrentUser());

// Start login (opens browser)
clerkAuth.startLogin();

// Logout
clerkAuth.logout();
```

## File Structure Reference

```
src/
├── main.js                          # Main process (IPC handlers, deep links)
├── services/
│   └── ClerkAuthService.js          # Authentication logic
├── renderer/
│   ├── clerk-auth-helper.js         # Renderer auth helper
│   └── renderer.js                  # UI integration
└── preload.js                       # Secure IPC bridge (optional)

Documentation/
├── CLERK_OAUTH_SETUP.md             # Detailed setup guide
├── WEB_APP_INTEGRATION.md           # Web app implementation
├── IMPLEMENTATION_SUMMARY.md        # Technical overview
└── QUICK_START.md                   # This file
```

## Getting Help

1. **Check documentation**:
   - `CLERK_OAUTH_SETUP.md` - Detailed setup and troubleshooting
   - `WEB_APP_INTEGRATION.md` - Web app integration guide

2. **Check console logs**:
   - Look for error messages with ❌
   - Check for authentication flow messages with 🔐

3. **Common issues**:
   - Protocol not registered → Rebuild app
   - State mismatch → Try again (timeout)
   - Token verification failed → Check Clerk keys

4. **Still stuck?**:
   - Open an issue with:
     - Platform (macOS/Windows/Linux)
     - Error messages from console
     - Steps to reproduce

## Success Indicators

You'll know it's working when you see:

1. ✅ "Protocols registered: hintify://, myapp://" on startup
2. 🔐 "Starting Clerk OAuth login..." when clicking sign-in
3. 🔗 "Processing deep link: myapp://auth/callback..." on callback
4. ✅ "State parameter validated successfully"
5. ✅ "Token verified successfully"
6. ✅ "Credentials stored securely in system keychain"
7. 🎉 "Clerk authentication successful"
8. UI updates to show user info

## That's It! 🎉

You're now ready to use Clerk OAuth authentication in your Electron app.

For more details, see:
- `CLERK_OAUTH_SETUP.md` - Comprehensive guide
- `WEB_APP_INTEGRATION.md` - Web app implementation
- `IMPLEMENTATION_SUMMARY.md` - Technical details

