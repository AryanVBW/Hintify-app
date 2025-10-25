# Clerk OAuth Authentication Bridge - Setup Guide

This document explains the secure OAuth authentication bridge between the Hintify Electron desktop application and the web application using Clerk for authentication.

## Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [Security Features](#security-features)
- [Setup Instructions](#setup-instructions)
- [Testing the Flow](#testing-the-flow)
- [Platform-Specific Setup](#platform-specific-setup)
- [Troubleshooting](#troubleshooting)
- [Architecture Details](#architecture-details)

## Overview

The authentication bridge enables users to sign in to the Electron desktop app using their Google account via Clerk OAuth. The flow uses a custom deep link protocol (`myapp://`) to securely pass authentication tokens from the web app back to the desktop app.

### Why This Approach?

1. **Security**: Opening the system browser is more secure than embedding a webview
   - Uses the system's default browser with its security features
   - Leverages browser's password managers and autofill
   - Prevents credential theft through compromised webviews
   - Users can see the actual URL in their trusted browser

2. **User Experience**: Familiar OAuth flow in the user's preferred browser
3. **Token Security**: Tokens are stored in the system keychain, never in plain text
4. **CSRF Protection**: State parameter prevents cross-site request forgery attacks

## Authentication Flow

```
┌─────────────┐                                    ┌──────────────┐
│   Electron  │                                    │   Web App    │
│     App     │                                    │   (Clerk)    │
└──────┬──────┘                                    └──────┬───────┘
       │                                                  │
       │ 1. User clicks "Sign in with Google"            │
       │                                                  │
       │ 2. Generate state UUID (crypto.randomUUID())    │
       │                                                  │
       │ 3. Open browser:                                │
       │    https://hintify.nexus-v.tech/auth/desktop?   │
       │    state=<uuid>                                 │
       ├─────────────────────────────────────────────────>│
       │                                                  │
       │                                    4. User signs in with Google
       │                                       (Clerk handles OAuth)
       │                                                  │
       │ 5. Redirect to deep link:                       │
       │    myapp://auth/callback?token=<jwt>&state=<uuid>
       │<─────────────────────────────────────────────────┤
       │                                                  │
       │ 6. Validate state parameter                     │
       │    (prevents CSRF attacks)                      │
       │                                                  │
       │ 7. Verify JWT token:                            │
       │    - Fetch JWKS from Clerk                      │
       │    - Verify signature                           │
       │    - Check expiration                           │
       │                                                  │
       │ 8. Store token in system keychain               │
       │    (macOS Keychain, Windows Credential Vault,   │
       │     Linux Secret Service)                       │
       │                                                  │
       │ 9. Establish session & update UI                │
       │                                                  │
```

### Step-by-Step Flow

1. **User Initiates Login**
   - User clicks "Sign in with Google" in Electron app
   - Renderer calls `clerkAuth.startLogin()`

2. **State Generation**
   - Main process generates cryptographically secure state UUID using `crypto.randomUUID()`
   - State is stored temporarily (5-minute timeout)

3. **Browser Opens**
   - System browser opens to: `https://hintify.nexus-v.tech/auth/desktop?state=<uuid>`
   - Uses `shell.openExternal()` for security

4. **Web App Authentication**
   - Web app handles Google OAuth via Clerk
   - User completes authentication in browser

5. **Deep Link Callback**
   - Web app redirects to: `myapp://auth/callback?token=<session_token>&state=<uuid>`
   - OS triggers the Electron app with this URL

6. **State Validation**
   - Main process validates that received state matches the original UUID
   - Prevents CSRF and replay attacks

7. **Token Verification**
   - Fetches Clerk's JWKS (JSON Web Key Set) from `https://[clerk-domain]/.well-known/jwks.json`
   - Verifies JWT signature using public key
   - Checks token expiration (`exp` claim)
   - Validates issuer (`iss` claim)

8. **Secure Storage**
   - Token stored in system keychain using `keytar`:
     - **macOS**: Keychain
     - **Windows**: Credential Vault
     - **Linux**: Secret Service API (libsecret)
   - Never stored in plain text files or localStorage

9. **Session Establishment**
   - User data fetched from Clerk API
   - Session established in main process
   - Renderer UI updated to show authenticated state

## Security Features

### 1. State Parameter (CSRF Protection)

The state parameter is a cryptographically secure random UUID that prevents CSRF attacks:

```javascript
// Generation (main process)
const state = crypto.randomUUID(); // e.g., "550e8400-e29b-41d4-a716-446655440000"

// Validation (main process)
if (receivedState !== originalState) {
  throw new Error('State mismatch - possible CSRF attack');
}
```

**Why this matters**: Without state validation, an attacker could trick a user into authenticating for the attacker's account.

### 2. JWT Token Verification

Tokens are verified using Clerk's public key before being trusted:

```javascript
// 1. Decode token header to get key ID (kid)
const decoded = jwt.decode(token, { complete: true });
const kid = decoded.header.kid;

// 2. Fetch signing key from Clerk's JWKS endpoint
const signingKey = await getSigningKeyFromJWKS(kid);

// 3. Verify signature, expiration, and issuer
const verified = jwt.verify(token, signingKey, {
  algorithms: ['RS256'],
  issuer: 'https://clerk.hintify.nexus-v.tech'
});
```

**Why this matters**: Prevents token forgery and ensures tokens are genuine Clerk-issued tokens.

### 3. Secure Credential Storage

Credentials are stored using the system's secure credential manager:

```javascript
// Store (uses keytar)
await keytar.setPassword('com.hintify.clerk-auth', 'clerk_session_token', token);

// Retrieve
const token = await keytar.getPassword('com.hintify.clerk-auth', 'clerk_session_token');
```

**Platform-specific storage**:
- **macOS**: Keychain (encrypted, requires user authentication)
- **Windows**: Credential Manager (encrypted by Windows)
- **Linux**: Secret Service API via libsecret (encrypted)

### 4. Token Lifecycle Management

- **Expiration**: Tokens are checked for expiration before use
- **Refresh**: Session restoration validates token freshness
- **Cleanup**: Tokens are cleared on logout
- **Timeout**: Authentication flow times out after 5 minutes

## Setup Instructions

### 1. Environment Variables

Create a `.env.local` file in the project root:

```bash
# Clerk Configuration
CLERK_PUBLISHABLE_KEY=pk_test_... # or pk_live_...
CLERK_SECRET_KEY=sk_test_...      # or sk_live_...
CLERK_FRONTEND_API=clerk.hintify.nexus-v.tech

# Optional: For development
NODE_ENV=development
```

**Important**: Never commit `.env.local` to version control. Add it to `.gitignore`.

### 2. Install Dependencies

```bash
npm install
```

This installs:
- `keytar` - Secure credential storage
- `@clerk/backend` - Clerk backend SDK
- `jwks-rsa` - JWT verification
- `jsonwebtoken` - JWT handling

### 3. Web App Configuration

Your web app at `https://hintify.nexus-v.tech` needs to:

1. **Handle the `/auth/desktop` route**:
   ```javascript
   // Example Next.js page
   export default function DesktopAuth() {
     const { state } = useSearchParams();
     const { session } = useClerk();
     
     useEffect(() => {
       if (session) {
         // Get session token
         const token = await session.getToken();
         
         // Redirect to deep link
         window.location.href = `myapp://auth/callback?token=${token}&state=${state}`;
       }
     }, [session, state]);
     
     return <SignIn />;
   }
   ```

2. **Configure Clerk redirect URLs**:
   - Add `myapp://auth/callback` to allowed redirect URLs in Clerk dashboard

### 4. Build the App

```bash
# Development
npm run dev

# Production build
npm run build
```

## Testing the Flow

### Local Testing

1. **Start the Electron app**:
   ```bash
   npm run dev
   ```

2. **Click "Sign in with Google"**:
   - Browser should open to your web app
   - URL should include `?state=<uuid>` parameter

3. **Complete sign-in in browser**:
   - Sign in with Google via Clerk
   - Browser should redirect to `myapp://auth/callback?token=...&state=...`

4. **Verify in Electron app**:
   - App should receive the deep link
   - Check console for validation logs
   - UI should update to show authenticated state

### Testing Deep Link Registration

**macOS**:
```bash
# Check if protocol is registered
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

### Testing Token Storage

```javascript
// In Electron DevTools console (main process)
const keytar = require('keytar');

// Check if token is stored
keytar.getPassword('com.hintify.clerk-auth', 'clerk_session_token')
  .then(token => console.log('Token found:', !!token));
```

## Platform-Specific Setup

### macOS

**Code Signing Requirements**:
- Protocol handlers require code signing on macOS
- For development, create a self-signed certificate:

```bash
# Run the provided script
./create-certificate.sh

# Or manually:
security create-keychain -p "" build.keychain
security default-keychain -s build.keychain
security unlock-keychain -p "" build.keychain
```

**Testing without code signing**:
```bash
# Build unsigned for testing
npm run build-mac-arm64-dev
```

**Gatekeeper**:
- First launch may show "unidentified developer" warning
- Right-click app → Open to bypass (development only)

### Windows

**Protocol Registration**:
- Protocols are registered in Windows Registry during installation
- NSIS installer handles this automatically

**Testing**:
```powershell
# Test deep link
Start-Process "myapp://auth/callback?token=test&state=test"
```

**Troubleshooting**:
- If protocol doesn't work, reinstall the app
- Check registry: `HKEY_CURRENT_USER\Software\Classes\myapp`

### Linux

**Protocol Registration**:
- Protocols are registered via `.desktop` files
- Installed to `~/.local/share/applications/`

**Manual registration** (if needed):
```bash
# Create .desktop file
cat > ~/.local/share/applications/hintify.desktop << EOF
[Desktop Entry]
Name=Hintify
Exec=/path/to/hintify %U
Type=Application
MimeType=x-scheme-handler/myapp;
EOF

# Update database
update-desktop-database ~/.local/share/applications/
```

**Testing**:
```bash
xdg-open "myapp://auth/callback?token=test&state=test"
```

## Troubleshooting

### Protocol Not Registered

**Symptoms**: Deep link doesn't launch the app

**Solutions**:
1. **Rebuild the app**: `npm run build`
2. **Reinstall**: Delete app and reinstall
3. **Check logs**: Look for protocol registration errors in console
4. **macOS**: Ensure app is code-signed
5. **Linux**: Run `update-desktop-database`

### App Not Launching from Deep Link

**Symptoms**: Browser shows "Protocol not supported" or nothing happens

**Solutions**:
1. **Check if app is running**: Deep links work differently when app is already running
2. **Test with app closed**: Close app completely, then trigger deep link
3. **Check single instance lock**: Only one instance should run
4. **Platform-specific**:
   - macOS: Check Console.app for errors
   - Windows: Check Event Viewer
   - Linux: Run from terminal to see errors

### State Validation Fails

**Symptoms**: "State parameter mismatch" error

**Causes**:
1. **Timeout**: Authentication took longer than 5 minutes
2. **Multiple attempts**: User opened multiple sign-in windows
3. **Replay attack**: Same deep link used twice

**Solutions**:
1. Try signing in again (generates new state)
2. Close all browser windows and retry
3. Check system clock is correct

### Token Verification Fails

**Symptoms**: "Token verification failed" error

**Causes**:
1. **Invalid token**: Token is malformed or corrupted
2. **Expired token**: Token has expired
3. **Wrong issuer**: Token not issued by configured Clerk instance
4. **Network issues**: Can't fetch JWKS from Clerk

**Solutions**:
1. Check `CLERK_PUBLISHABLE_KEY` and `CLERK_FRONTEND_API` in `.env.local`
2. Verify network connectivity
3. Check Clerk dashboard for API status
4. Try signing in again

### Keytar/Keychain Errors

**Symptoms**: "Failed to store credentials" or "keytar" errors

**Platform-specific solutions**:

**macOS**:
```bash
# Reset keychain (development only!)
security delete-keychain build.keychain
security create-keychain -p "" build.keychain
```

**Windows**:
- Ensure Credential Manager service is running
- Check Windows security settings

**Linux**:
```bash
# Install libsecret
sudo apt-get install libsecret-1-dev  # Debian/Ubuntu
sudo dnf install libsecret-devel      # Fedora
```

### Deep Link Received But Not Processed

**Symptoms**: Deep link triggers app but nothing happens

**Debug steps**:
1. **Check console logs**: Look for "Processing deep link" messages
2. **Verify URL format**: Should be `myapp://auth/callback?token=...&state=...`
3. **Check event handlers**:
   - macOS: `app.on('open-url')` should fire
   - Windows/Linux: `app.on('second-instance')` should fire

**Solutions**:
1. Add debug logging to `handleDeepLink()` function
2. Verify protocol matches exactly (`myapp://` not `myapp:`)
3. Check for JavaScript errors in DevTools

## Architecture Details

### File Structure

```
src/
├── main.js                          # Main process
│   ├── ClerkAuthService integration
│   ├── IPC handlers (auth:start-clerk-login, etc.)
│   ├── Deep link handler (handleDeepLink)
│   └── Protocol registration
│
├── services/
│   └── ClerkAuthService.js          # Clerk authentication logic
│       ├── State generation & validation
│       ├── JWT verification
│       ├── Keytar integration
│       └── Session management
│
├── renderer/
│   ├── clerk-auth-helper.js         # Renderer-side auth helper
│   │   ├── IPC communication
│   │   ├── Event handling
│   │   └── State management
│   │
│   └── renderer.js                  # Main renderer
│       ├── UI event handlers
│       ├── Auth status updates
│       └── Error handling
│
└── preload.js                       # Secure IPC bridge (optional)
    └── contextBridge API exposure
```

### IPC Communication

**Main Process → Renderer**:
- `auth:clerk-success` - Authentication succeeded
- `auth:clerk-error` - Authentication failed
- `auth:clerk-status-changed` - Auth status changed (login/logout)

**Renderer → Main Process**:
- `auth:start-clerk-login` - Start OAuth flow
- `auth:get-clerk-status` - Get current auth status
- `auth:clerk-logout` - Sign out

### Session Lifecycle

1. **Initialization**: App starts, attempts to restore session from keychain
2. **Active**: User authenticated, session valid
3. **Expired**: Token expired, user must re-authenticate
4. **Logged Out**: User explicitly logged out, credentials cleared

### Token Refresh Strategy

Currently, tokens are not automatically refreshed. When a token expires:
1. User is prompted to sign in again
2. New token is obtained via OAuth flow
3. Old token is replaced in keychain

**Future enhancement**: Implement automatic token refresh using Clerk's refresh tokens.

## Additional Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Electron Deep Linking](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Keytar Documentation](https://github.com/atom/node-keytar)

## Support

For issues or questions:
1. Check this documentation
2. Review console logs for error messages
3. Test with the provided debugging steps
4. Open an issue on GitHub with:
   - Platform (macOS/Windows/Linux)
   - Error messages from console
   - Steps to reproduce

