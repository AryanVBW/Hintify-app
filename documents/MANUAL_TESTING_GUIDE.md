# Clerk OAuth Authentication - Manual Testing Guide

**Purpose**: Step-by-step guide for manually testing the Clerk OAuth authentication flow  
**Platform**: macOS (Primary), Windows/Linux (Cross-platform testing)  
**Prerequisites**: Electron app built and running, web app deployed

---

## Prerequisites

### 1. Environment Setup

Ensure `.env.local` is configured:

```bash
# Check if .env.local exists
ls -la .env.local

# Verify contents (should have Clerk credentials)
cat .env.local | grep CLERK
```

Expected output:
```
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_FRONTEND_API=native-catfish-11.clerk.accounts.dev
```

### 2. Dependencies Installed

```bash
# Verify required packages are installed
npm list keytar @clerk/backend jwks-rsa jsonwebtoken

# If missing, install
npm install
```

### 3. Web App Running

Verify the web app is accessible:
```bash
curl -I https://hintify.nexus-v.tech/auth/desktop
```

Should return `200 OK` or redirect to Clerk.

---

## Test 1: Start Authentication Flow

### Steps

1. **Start the Electron app**:
   ```bash
   npm run dev
   ```

2. **Open Developer Tools** (for debugging):
   - macOS: `Cmd+Option+I`
   - Windows/Linux: `Ctrl+Shift+I`

3. **Navigate to the login screen** (if not already there)

4. **Click "Sign in with Google"** button

### Expected Results

✅ **Console Output**:
```
🔐 Starting Clerk OAuth login flow...
✅ Browser opened for authentication
```

✅ **Browser Behavior**:
- System default browser opens
- Navigates to: `https://hintify.nexus-v.tech/auth/desktop?state=<uuid>`
- Shows Clerk authentication page

✅ **App Behavior**:
- App remains open
- Shows loading indicator (if implemented)
- Waits for callback

### Troubleshooting

❌ **Browser doesn't open**:
- Check console for errors
- Verify `shell.openExternal()` is working
- Check if browser is set as default

❌ **Wrong URL opened**:
- Verify `CLERK_FRONTEND_API` in `.env.local`
- Check `ClerkAuthService.startLogin()` method

---

## Test 2: Complete Google OAuth

### Steps

1. **In the browser**, click "Continue with Google"

2. **Select Google account** or sign in

3. **Grant permissions** if prompted

4. **Wait for redirect** back to the app

### Expected Results

✅ **Browser Behavior**:
- Redirects to Clerk
- Shows Google OAuth consent screen
- After approval, redirects to: `myapp://auth/callback?token=<jwt>&state=<uuid>`

✅ **Deep Link Behavior**:
- Browser shows "Open Hintify?" dialog (or similar)
- Click "Open" to trigger deep link

✅ **App Behavior**:
- App comes to foreground
- Deep link handler processes callback

### Troubleshooting

❌ **Deep link doesn't trigger**:
- Verify protocol registration: `app.setAsDefaultProtocolClient('myapp')`
- Check if another app is registered for `myapp://`
- Try manually opening: `open myapp://auth/callback?token=test&state=test`

❌ **Browser shows error**:
- Check web app logs
- Verify Clerk configuration
- Check redirect URLs in Clerk Dashboard

---

## Test 3: Deep Link Callback Processing

### Steps

1. **Monitor console output** in Electron app

2. **Deep link should be received** automatically

### Expected Results

✅ **Console Output**:
```
🔗 Processing deep link: myapp://auth/callback?token=...&state=...
✅ State parameter validated successfully
✅ Token verified successfully
✅ Credentials stored securely in system keychain
🎉 Authentication completed successfully
```

✅ **App Behavior**:
- Loading indicator disappears
- User is logged in
- User profile displayed
- Main app screen shown

### Troubleshooting

❌ **State validation fails**:
```
❌ State parameter mismatch - possible CSRF attack
```
- Check if state parameter is being passed correctly
- Verify web app is sending the same state back
- Check for URL encoding issues

❌ **Token verification fails**:
```
❌ Token verification failed: ...
```
- Verify `CLERK_FRONTEND_API` is correct
- Check JWKS endpoint is accessible
- Verify token is a valid JWT

❌ **Keychain storage fails**:
```
❌ Error storing credentials: ...
```
- Check keytar is installed correctly
- Verify system keychain is accessible
- Check permissions (macOS may prompt for keychain access)

---

## Test 4: Session Persistence

### Steps

1. **Verify user is logged in** (from Test 3)

2. **Quit the app completely**:
   - macOS: `Cmd+Q`
   - Windows/Linux: Close all windows

3. **Restart the app**:
   ```bash
   npm run dev
   ```

4. **Wait for app to load**

### Expected Results

✅ **Console Output**:
```
🔄 Clerk authentication restored from storage
✅ Session restored from stored credentials
```

✅ **App Behavior**:
- User is automatically logged in
- No login screen shown
- User profile displayed
- Session data restored

### Troubleshooting

❌ **Session not restored**:
```
ℹ️ No stored credentials found
```
- Check if credentials were stored in Test 3
- Verify keytar is working
- Check keychain manually (macOS: Keychain Access app)

❌ **Token expired**:
```
⚠️ Stored token has expired
```
- This is expected if token is older than 1 hour
- User should be prompted to re-authenticate
- Implement token refresh mechanism

---

## Test 5: Logout

### Steps

1. **Verify user is logged in**

2. **Click "Logout"** button (or trigger logout via menu)

3. **Monitor console output**

### Expected Results

✅ **Console Output**:
```
🚪 Signing out from Clerk...
✅ Credentials cleared from system keychain
🚪 User signed out
```

✅ **App Behavior**:
- User is logged out
- Login screen shown
- User profile cleared
- Session data cleared

✅ **Keychain Behavior**:
- Credentials removed from system keychain
- Can verify manually (macOS: Keychain Access app, search for "com.hintify.clerk-auth")

### Troubleshooting

❌ **Logout fails**:
```
❌ Error clearing credentials: ...
```
- Check keytar is working
- Verify keychain is accessible
- Check permissions

❌ **Session not cleared**:
- Check `ClerkAuthService.signOut()` method
- Verify IPC communication is working
- Check renderer is receiving logout event

---

## Test 6: Error Scenarios

### Test 6.1: Invalid State Parameter

**Simulate**: Manually trigger deep link with wrong state

```bash
# macOS
open "myapp://auth/callback?token=fake_token&state=wrong_state"

# Windows (PowerShell)
Start-Process "myapp://auth/callback?token=fake_token&state=wrong_state"

# Linux
xdg-open "myapp://auth/callback?token=fake_token&state=wrong_state"
```

**Expected Result**:
```
❌ State parameter mismatch - possible CSRF attack
```

App should show error message and return to login screen.

---

### Test 6.2: Invalid Token

**Simulate**: Manually trigger deep link with invalid JWT

```bash
open "myapp://auth/callback?token=invalid.jwt.token&state=<valid_state>"
```

**Expected Result**:
```
❌ Token verification failed: Invalid token structure
```

App should show error message and return to login screen.

---

### Test 6.3: Network Failure

**Simulate**: Disconnect from internet before completing OAuth

**Expected Result**:
- Browser shows network error
- App shows timeout message after 5 minutes
- User can retry authentication

---

### Test 6.4: User Cancels Authentication

**Simulate**: Close browser window during OAuth flow

**Expected Result**:
- App shows timeout message after 5 minutes
- User can retry authentication
- No credentials stored

---

## Test 7: Cross-Platform Testing

### macOS Testing

**Protocol Handler**: `open-url` event

```bash
# Test deep link
open "myapp://auth/callback?token=test&state=test"

# Verify protocol registration
defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist | grep -A 5 myapp
```

**Expected**: App launches and processes deep link

---

### Windows Testing

**Protocol Handler**: `second-instance` event

```powershell
# Test deep link
Start-Process "myapp://auth/callback?token=test&state=test"

# Verify protocol registration
Get-ItemProperty -Path "HKCU:\Software\Classes\myapp"
```

**Expected**: App launches or focuses existing instance and processes deep link

---

### Linux Testing

**Protocol Handler**: `second-instance` event

```bash
# Test deep link
xdg-open "myapp://auth/callback?token=test&state=test"

# Verify protocol registration
cat ~/.local/share/applications/hintify.desktop | grep myapp
```

**Expected**: App launches or focuses existing instance and processes deep link

---

## Test 8: Production Build Testing

### Build the App

```bash
# macOS
npm run build-mac-arm64

# Windows
npm run build-win

# Linux
npm run build-linux
```

### Install and Test

1. **Install the built app** from `dist/` directory

2. **Launch the app** (not from terminal)

3. **Repeat Tests 1-7** with the production build

4. **Verify protocol registration** works in production

### Expected Results

✅ All tests pass with production build  
✅ Protocol registration works  
✅ Deep links trigger correctly  
✅ No console errors

---

## Debugging Tips

### Enable Verbose Logging

Add to `.env.local`:
```bash
DEBUG=clerk:*
NODE_ENV=development
```

### Check Keychain (macOS)

1. Open **Keychain Access** app
2. Search for `com.hintify.clerk-auth`
3. Verify credentials are stored/removed correctly

### Check Windows Credential Manager

1. Open **Credential Manager**
2. Look for `com.hintify.clerk-auth`
3. Verify credentials are stored/removed correctly

### Check Linux Secret Service

```bash
# Install secret-tool if not available
sudo apt-get install libsecret-tools

# List secrets
secret-tool search service com.hintify.clerk-auth
```

### Monitor Network Requests

1. Open browser DevTools (F12)
2. Go to Network tab
3. Monitor requests to Clerk API
4. Check for errors or failed requests

---

## Test Checklist

Use this checklist to track your testing progress:

### Basic Flow
- [ ] Start authentication flow
- [ ] Complete Google OAuth
- [ ] Deep link callback received
- [ ] State parameter validated
- [ ] JWT token verified
- [ ] Credentials stored in keychain
- [ ] User logged in successfully

### Session Management
- [ ] Session persists after app restart
- [ ] User data restored correctly
- [ ] Logout clears credentials
- [ ] Logout clears session data

### Error Scenarios
- [ ] Invalid state parameter handled
- [ ] Invalid token handled
- [ ] Network failure handled
- [ ] User cancellation handled
- [ ] Timeout handled (5 minutes)

### Cross-Platform
- [ ] macOS: `open-url` event works
- [ ] Windows: `second-instance` event works
- [ ] Linux: `second-instance` event works
- [ ] Protocol registration verified on all platforms

### Production Build
- [ ] Production build created successfully
- [ ] App installs correctly
- [ ] Protocol registration works in production
- [ ] All tests pass with production build

---

## Success Criteria

✅ **All tests pass**  
✅ **No console errors**  
✅ **Credentials stored securely**  
✅ **Session persists correctly**  
✅ **Logout works properly**  
✅ **Error scenarios handled gracefully**  
✅ **Cross-platform compatibility verified**  
✅ **Production build works correctly**

---

## Next Steps After Testing

1. **Document any issues found** during testing
2. **Fix any bugs** discovered
3. **Update documentation** if needed
4. **Deploy to production** if all tests pass
5. **Monitor production** for any issues

---

**Guide Version**: 1.0  
**Last Updated**: 2025-10-25  
**Author**: Augment Agent

