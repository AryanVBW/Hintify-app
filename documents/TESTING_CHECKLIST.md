# Testing Checklist - Clerk OAuth Authentication

Use this checklist to verify the Clerk OAuth authentication implementation is working correctly.

## Pre-Testing Setup

- [ ] `.env.local` file created with Clerk credentials
- [ ] Dependencies installed (`npm install`)
- [ ] Web app `/auth/desktop` endpoint implemented
- [ ] Clerk dashboard configured with redirect URLs

## Development Testing

### 1. Protocol Registration

**macOS**:
- [ ] Run: `defaults read ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist | grep -A 5 myapp`
- [ ] Verify `myapp` protocol is listed

**Windows**:
- [ ] Run: `Get-ItemProperty -Path "HKCU:\Software\Classes\myapp"`
- [ ] Verify registry key exists

**Linux**:
- [ ] Run: `cat ~/.local/share/applications/hintify.desktop | grep myapp`
- [ ] Verify `myapp` is in MimeType

### 2. App Startup

- [ ] App starts without errors
- [ ] Console shows: "✅ All services initialized successfully"
- [ ] Console shows: "✅ Protocols registered: hintify://, myapp://"
- [ ] No authentication errors on startup

### 3. First-Time Login Flow

**Start the flow**:
- [ ] Click "Sign in with Google" button
- [ ] Console shows: "🔐 Starting Clerk OAuth login..."
- [ ] Console shows state UUID generated
- [ ] Browser opens to web app

**In the browser**:
- [ ] URL includes `?state=<uuid>` parameter
- [ ] Clerk sign-in form appears
- [ ] Can sign in with Google
- [ ] After sign-in, redirects to `myapp://auth/callback?token=...&state=...`

**Back in Electron app**:
- [ ] Console shows: "🔗 Processing deep link: myapp://auth/callback..."
- [ ] Console shows: "✅ State parameter validated successfully"
- [ ] Console shows: "✅ Token verified successfully"
- [ ] Console shows: "✅ Credentials stored securely in system keychain"
- [ ] Console shows: "🎉 Clerk authentication successful"
- [ ] UI updates to show user information
- [ ] Sign-in button changes to user profile/logout

### 4. App Launch from Deep Link (App Not Running)

**Close the app completely**:
- [ ] Quit the app (Cmd+Q on macOS, Alt+F4 on Windows)
- [ ] Verify app is not running in task manager

**Trigger deep link**:
- [ ] macOS: Run `open "myapp://auth/callback?token=test&state=test"`
- [ ] Windows: Run `Start-Process "myapp://auth/callback?token=test&state=test"`
- [ ] Linux: Run `xdg-open "myapp://auth/callback?token=test&state=test"`

**Verify**:
- [ ] App launches
- [ ] Console shows: "🔗 Processing deep link..."
- [ ] Error shown (expected - test token is invalid)
- [ ] No crashes

### 5. Deep Link When App Already Running

**With app running**:
- [ ] Trigger deep link again (same command as above)

**Verify**:
- [ ] App comes to foreground
- [ ] Console shows: "🔗 Processing deep link..."
- [ ] No new window opens
- [ ] Single instance lock working

### 6. State Validation

**Test mismatched state**:
- [ ] Start login flow (generates state A)
- [ ] Manually trigger deep link with different state: `myapp://auth/callback?token=test&state=wrong-state`

**Verify**:
- [ ] Console shows: "❌ State parameter mismatch"
- [ ] Error message shown to user
- [ ] Authentication rejected
- [ ] No credentials stored

### 7. Invalid Token Rejection

**Test with invalid token**:
- [ ] Start login flow
- [ ] Manually trigger deep link with invalid token: `myapp://auth/callback?token=invalid-jwt&state=<correct-state>`

**Verify**:
- [ ] Console shows: "❌ Token verification failed"
- [ ] Error message shown to user
- [ ] Authentication rejected
- [ ] No credentials stored

### 8. Token Persistence Across Restarts

**After successful login**:
- [ ] Verify user is logged in
- [ ] Quit the app completely
- [ ] Restart the app

**Verify**:
- [ ] Console shows: "🔄 Restoring Clerk session from storage..."
- [ ] Console shows: "✅ Clerk session restored successfully"
- [ ] User still logged in
- [ ] UI shows user information
- [ ] No need to sign in again

### 9. Logout Functionality

**Test logout**:
- [ ] Click logout button
- [ ] Console shows: "🔓 Signing out from Clerk..."

**Verify**:
- [ ] Console shows: "✅ Clerk logout successful"
- [ ] UI updates to show sign-in button
- [ ] User information cleared
- [ ] Credentials removed from keychain

**After logout**:
- [ ] Quit and restart app
- [ ] Verify user is NOT logged in
- [ ] Sign-in button shown
- [ ] No session restored

### 10. Timeout Mechanism

**Test authentication timeout**:
- [ ] Click "Sign in with Google"
- [ ] Browser opens
- [ ] Wait 6 minutes (timeout is 5 minutes)
- [ ] Try to complete sign-in

**Verify**:
- [ ] Console shows: "⏱️ Authentication timeout - state expired"
- [ ] Error message shown
- [ ] Authentication rejected
- [ ] User can retry (generates new state)

### 11. Multiple Sign-In Attempts

**Test multiple attempts**:
- [ ] Click "Sign in with Google"
- [ ] Browser opens (attempt 1)
- [ ] Don't complete sign-in
- [ ] Click "Sign in with Google" again
- [ ] Browser opens (attempt 2)
- [ ] Complete sign-in in second browser window

**Verify**:
- [ ] Second attempt succeeds
- [ ] First attempt's state is invalidated
- [ ] Only one session established
- [ ] No duplicate credentials

### 12. Network Error Handling

**Test with no internet**:
- [ ] Disconnect from internet
- [ ] Click "Sign in with Google"

**Verify**:
- [ ] Browser opens (or shows error)
- [ ] Appropriate error message shown
- [ ] App doesn't crash
- [ ] Can retry when internet restored

### 13. Concurrent Sessions

**Test with multiple devices**:
- [ ] Sign in on Device A
- [ ] Sign in on Device B (same account)

**Verify**:
- [ ] Both devices can sign in
- [ ] Each has independent session
- [ ] Logout on one doesn't affect other

## Platform-Specific Testing

### macOS Testing

- [ ] Test on macOS 11 (Big Sur) or later
- [ ] Test with code-signed build
- [ ] Test with unsigned build (development)
- [ ] Verify Keychain access works
- [ ] Test with Gatekeeper enabled
- [ ] Test deep link from Safari
- [ ] Test deep link from Chrome
- [ ] Test deep link from Firefox

### Windows Testing

- [ ] Test on Windows 10 or later
- [ ] Verify Credential Manager storage works
- [ ] Test deep link from Edge
- [ ] Test deep link from Chrome
- [ ] Test deep link from Firefox
- [ ] Verify protocol registration in registry
- [ ] Test with Windows Defender enabled

### Linux Testing

- [ ] Test on Ubuntu 20.04 or later
- [ ] Test on Fedora 35 or later
- [ ] Verify libsecret is installed
- [ ] Test deep link from default browser
- [ ] Verify .desktop file created
- [ ] Test with different desktop environments (GNOME, KDE, XFCE)

## Production Build Testing

### Build Process

- [ ] Build for macOS: `npm run build-mac`
- [ ] Build for Windows: `npm run build-win`
- [ ] Build for Linux: `npm run build-linux`
- [ ] No build errors
- [ ] Installers created successfully

### Installation Testing

**macOS**:
- [ ] Install .dmg file
- [ ] App launches from Applications folder
- [ ] Protocol registered after installation
- [ ] Keychain access works

**Windows**:
- [ ] Install .exe file
- [ ] App launches from Start Menu
- [ ] Protocol registered after installation
- [ ] Credential Manager access works

**Linux**:
- [ ] Install .AppImage or .deb
- [ ] App launches from application menu
- [ ] Protocol registered after installation
- [ ] Secret Service access works

### Post-Installation Testing

- [ ] Repeat all development tests with production build
- [ ] Verify protocol registration persists after restart
- [ ] Test auto-update mechanism (if implemented)
- [ ] Verify code signing (macOS/Windows)

## Security Testing

### Token Security

- [ ] Tokens never logged to console (check all logs)
- [ ] Tokens not stored in plain text files
- [ ] Tokens not in localStorage or sessionStorage
- [ ] Tokens only in system keychain

### State Parameter Security

- [ ] State is cryptographically random (UUID v4)
- [ ] State validated on every callback
- [ ] State expires after 5 minutes
- [ ] State can't be reused

### JWT Verification

- [ ] Token signature verified
- [ ] Token expiration checked
- [ ] Token issuer validated
- [ ] Invalid tokens rejected

### CSRF Protection

- [ ] State parameter prevents CSRF
- [ ] Can't authenticate with someone else's state
- [ ] Replay attacks prevented

## Error Handling Testing

### User-Facing Errors

- [ ] Clear error messages shown
- [ ] Errors don't expose sensitive information
- [ ] User can retry after error
- [ ] Errors logged for debugging

### Edge Cases

- [ ] Handle missing state parameter
- [ ] Handle malformed tokens
- [ ] Handle network timeouts
- [ ] Handle Clerk API errors
- [ ] Handle keychain access denied
- [ ] Handle browser not opening

## Performance Testing

- [ ] App starts in <3 seconds
- [ ] Sign-in flow completes in <10 seconds (with network)
- [ ] Token verification takes <1 second
- [ ] Session restoration takes <500ms
- [ ] No memory leaks during auth flow
- [ ] No excessive CPU usage

## Accessibility Testing

- [ ] Sign-in button has proper label
- [ ] Error messages are screen-reader friendly
- [ ] Keyboard navigation works
- [ ] Focus management during auth flow
- [ ] High contrast mode supported

## Documentation Testing

- [ ] README is accurate
- [ ] Setup instructions work
- [ ] Troubleshooting guide is helpful
- [ ] Code examples are correct
- [ ] Environment variables documented

## Final Checklist

- [ ] All development tests pass
- [ ] All platform-specific tests pass
- [ ] All production build tests pass
- [ ] All security tests pass
- [ ] All error handling tests pass
- [ ] Performance is acceptable
- [ ] Documentation is complete
- [ ] Ready for deployment

## Test Results

### Date: _______________
### Tester: _______________
### Platform: _______________

**Overall Result**: ☐ Pass ☐ Fail

**Notes**:
```
[Add any notes, issues found, or observations here]
```

**Issues Found**:
1. 
2. 
3. 

**Action Items**:
1. 
2. 
3. 

---

## Automated Testing (Future)

Consider implementing automated tests for:

- [ ] Unit tests for ClerkAuthService
- [ ] Integration tests for IPC communication
- [ ] E2E tests for authentication flow
- [ ] Security tests for token handling
- [ ] Performance benchmarks

Example test structure:
```javascript
describe('ClerkAuthService', () => {
  test('generates valid state parameter', () => {
    const state = clerkAuthService.generateState();
    expect(state).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('validates matching state', () => {
    const state = clerkAuthService.generateState();
    expect(clerkAuthService.validateState(state)).toBe(true);
  });

  test('rejects mismatched state', () => {
    clerkAuthService.generateState();
    expect(clerkAuthService.validateState('wrong-state')).toBe(false);
  });
});
```

---

**Remember**: Security is critical. Test thoroughly before deploying to production!

