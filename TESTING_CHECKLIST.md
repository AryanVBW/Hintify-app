# Settings Page Testing Checklist

## Pre-Testing Setup

- [ ] Application is running (`npm run dev`)
- [ ] DevTools console is open (F12 or Cmd+Option+I)
- [ ] Settings page is open (click gear icon)

---

## Console Verification

### Expected Initialization Messages:
```
[Settings] 🚀 Initializing settings page...
[Settings] Caching DOM elements...
[Settings] Found 18 elements
[Settings] Attaching event listeners...
[Settings] ✓ Save button listener attached
[Settings] ✓ Cancel button listener attached
[Settings] ✓ Test connection button listener attached
[Settings] ✓ Sign in button listener attached
[Settings] ✓ Sign out button listener attached
[Settings] ✓ Refresh Ollama models button listener attached
[Settings] ✓ Paste API key button listener attached
[Settings] ✓ Toggle key visibility button listener attached
[Settings] ✓ Check for updates button listener attached
[Settings] ✓ Update now button listener attached
[Settings] ✓ Update later button listener attached
[Settings] ✓ Provider select listener attached
[Settings] ✓ Theme select listener attached
[Settings] All event listeners attached successfully
[Settings] Settings loaded into form
[Settings] User card refreshed
[Settings] Updates section initialized, version: X.X.X
[Settings] ✅ Settings page initialized successfully
```

- [ ] All initialization messages appear
- [ ] No JavaScript errors in console
- [ ] Version number displays correctly

---

## Button Testing

### 1. Save Settings Button ✅

**Test Steps:**
1. Make changes to any settings
2. Click "Save Settings" button

**Expected Results:**
- [ ] Console log: `[Settings] Save button clicked`
- [ ] Toast notification: "Settings saved successfully!" (green, 3s)
- [ ] Settings window closes after 1 second
- [ ] No errors in console

**Validation Test:**
1. Select Gemini provider
2. Clear API key field
3. Click "Save Settings"

**Expected Results:**
- [ ] Console log: `[Settings] Validation failed`
- [ ] Toast notification: "Gemini API key is required" (red, 4s)
- [ ] Settings window stays open
- [ ] No save occurs

---

### 2. Cancel Button ✅

**Test Steps:**
1. Make changes to any settings
2. Click "Cancel" button

**Expected Results:**
- [ ] Console log: `[Settings] Cancel button clicked`
- [ ] Toast notification: "Settings not saved" (blue, 2s)
- [ ] Settings window closes immediately
- [ ] Changes are not saved

---

### 3. Test Connection Button ✅

**Test with Gemini:**
1. Select "Gemini" provider
2. Enter valid API key
3. Click "Test Connection"

**Expected Results:**
- [ ] Console log: `[Settings] Test connection button clicked`
- [ ] Toast notification: "Testing connection..." (blue, 2s)
- [ ] Toast notification: "✓ Gemini connection successful!" (green, 3s)
- [ ] No errors in console

**Test with Invalid Key:**
1. Enter invalid API key
2. Click "Test Connection"

**Expected Results:**
- [ ] Toast notification: "Invalid API key or unauthorized" (red, 4s)

**Test with Ollama:**
1. Select "Ollama" provider
2. Make sure Ollama is running
3. Click "Test Connection"

**Expected Results:**
- [ ] Toast notification: "✓ Ollama connected! Found X model(s)" (green, 3s)

**Test with Ollama Not Running:**
1. Stop Ollama
2. Click "Test Connection"

**Expected Results:**
- [ ] Toast notification: "Could not connect. Make sure Ollama is running." (red, 4s)

---

### 4. Sign In Button ✅

**Test Steps:**
1. Click "Sign In" button

**Expected Results:**
- [ ] Console log: `[Settings] Sign in button clicked`
- [ ] Toast notification: "Opening browser for sign in..." (blue, 3s)
- [ ] Browser opens to authentication page
- [ ] No errors in console

---

### 5. Sign Out Button ✅

**Test Steps:**
1. Make sure you're signed in first
2. Click "Sign Out" button

**Expected Results:**
- [ ] Console log: `[Settings] Sign out button clicked`
- [ ] Toast notification: "Signed out successfully" (green, 2s)
- [ ] User card updates to show "Guest User"
- [ ] Sign In button becomes visible
- [ ] Sign Out button becomes hidden

---

### 6. Refresh Ollama Models Button ✅

**Test with Ollama Running:**
1. Make sure Ollama is running
2. Select "Ollama" provider
3. Click refresh button (circular arrow icon)

**Expected Results:**
- [ ] Console log: `[Settings] Refresh Ollama models button clicked`
- [ ] Toast notification: "Refreshing Ollama models..." (blue, 2s)
- [ ] Toast notification: "Found X Ollama model(s)" (green, 3s)
- [ ] Model dropdown updates with available models
- [ ] Status text shows "✓ X model(s) available"

**Test with Ollama Not Running:**
1. Stop Ollama
2. Click refresh button

**Expected Results:**
- [ ] Toast notification: "Could not connect to Ollama" (red, 4s)
- [ ] Model dropdown shows "Ollama not available"
- [ ] Status text shows "✗ Ollama not running or not installed"

---

### 7. Paste API Key Button ✅

**Test Steps:**
1. Copy some text to clipboard (e.g., "test-api-key-12345")
2. Click paste button (clipboard icon next to API key field)

**Expected Results:**
- [ ] Console log: `[Settings] Paste API key button clicked`
- [ ] Toast notification: "API key pasted from clipboard" (green, 2s)
- [ ] API key field contains the pasted text
- [ ] No errors in console

**Test with Empty Clipboard:**
1. Clear clipboard
2. Click paste button

**Expected Results:**
- [ ] Toast notification: "Clipboard is empty" (yellow, 2s)

---

### 8. Toggle Key Visibility Button ✅

**Test Steps:**
1. Enter some text in API key field
2. Click eye icon button

**Expected Results:**
- [ ] Console log: `[Settings] Toggle key visibility button clicked`
- [ ] Toast notification: "API key visible" (blue, 1.5s)
- [ ] API key field changes from password to text type
- [ ] Eye icon changes to "visibility_off"
- [ ] API key text is now visible

**Click Again:**
- [ ] Toast notification: "API key hidden" (blue, 1.5s)
- [ ] API key field changes back to password type
- [ ] Eye icon changes to "visibility"
- [ ] API key text is hidden again

---

### 9. Check for Updates Button ✅

**Test Steps:**
1. Click "Check for Updates" button

**Expected Results:**
- [ ] Console log: `[Settings] Check for updates button clicked`
- [ ] Toast notification: "Checking for updates..." (blue, 2s)
- [ ] One of these outcomes:
  - [ ] Toast: "Update available: X.X.X" (blue, 4s) + Update banner appears
  - [ ] Toast: "You are using the latest version!" (green, 3s)
  - [ ] Toast: "Update check failed" (red, 3s)

**Note:** In development mode, auto-updater may not work. This is expected.

---

### 10. Update Now Button ✅

**Test Steps:**
1. If update banner is visible, click "Update Now" button

**Expected Results:**
- [ ] Console log: `[Settings] Update now button clicked`
- [ ] Update banner hides
- [ ] Toast notification: "Downloading update..." (blue, 3s)
- [ ] Update download begins (if packaged app)

**Note:** Only works in packaged app, not in development mode.

---

### 11. Update Later Button ✅

**Test Steps:**
1. If update banner is visible, click "Later" button

**Expected Results:**
- [ ] Console log: `[Settings] Update later button clicked`
- [ ] Update banner hides
- [ ] Toast notification: "Update reminder dismissed for 24 hours" (blue, 3s)
- [ ] Update won't be shown again for 24 hours

---

## Form Input Testing

### Provider Selection
- [ ] Change provider to "Gemini"
  - [ ] Gemini fields become visible
  - [ ] Ollama fields become hidden
- [ ] Change provider to "Ollama"
  - [ ] Ollama fields become visible
  - [ ] Gemini fields become hidden

### Theme Selection
- [ ] Change theme to "Dark"
  - [ ] Theme applies immediately
  - [ ] Background becomes dark
- [ ] Change theme to "Light"
  - [ ] Theme applies immediately
  - [ ] Background becomes light
- [ ] Change theme to "Glass"
  - [ ] Theme applies immediately
  - [ ] Glassy effect appears

### Advanced Mode Toggle
- [ ] Check the checkbox
  - [ ] Checkbox becomes checked
- [ ] Uncheck the checkbox
  - [ ] Checkbox becomes unchecked

---

## Settings Persistence Testing

### Test Steps:
1. Change provider to "Gemini"
2. Select model "gemini-1.5-flash"
3. Enter API key "test-key-12345"
4. Change theme to "Light"
5. Check "Advanced Mode"
6. Click "Save Settings"
7. Close settings window
8. Reopen settings window

**Expected Results:**
- [ ] Provider is still "Gemini"
- [ ] Model is still "gemini-1.5-flash"
- [ ] API key is still "test-key-12345"
- [ ] Theme is still "Light"
- [ ] Advanced Mode is still checked

---

## Edge Case Testing

### Empty Inputs
- [ ] Try to save with empty API key (Gemini selected)
  - [ ] Shows validation error
  - [ ] Does not save

### Rapid Button Clicking
- [ ] Click Save button multiple times rapidly
  - [ ] Only one save operation occurs
  - [ ] No duplicate toasts

### Network Failures
- [ ] Disconnect network
- [ ] Try to test Gemini connection
  - [ ] Shows appropriate error message

### Opening/Closing Multiple Times
- [ ] Open settings
- [ ] Close settings
- [ ] Open settings again
- [ ] Close settings again
- [ ] Repeat 5 times
  - [ ] No errors occur
  - [ ] Settings still work correctly

---

## Debug Utilities Testing

### Test debugSettingsButtons()
```javascript
window.debugSettingsButtons()
```

**Expected Output:**
```
🧪 === SETTINGS BUTTONS DEBUG ===
✅ Save button: { id: 'save-btn', disabled: false, visible: true }
✅ Cancel button: { id: 'cancel-btn', disabled: false, visible: true }
✅ Test Connection button: { id: 'test-connection-btn', disabled: false, visible: true }
... (all buttons)
🧪 === DEBUG COMPLETE ===
```

- [ ] All buttons show as found (✅)
- [ ] No buttons show as missing (❌)

### Test debugSettingsConfig()
```javascript
window.debugSettingsConfig()
```

**Expected Output:**
```
🔧 === CURRENT CONFIGURATION ===
{
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark',
  advanced_mode: true
}
🔧 === CONFIG COMPLETE ===
```

- [ ] Configuration object displays correctly
- [ ] All expected keys are present

---

## Visual Inspection

### Material Icons
- [ ] All icons display correctly (no missing icon boxes)
- [ ] Icons are properly sized
- [ ] Icons have correct colors

### Layout
- [ ] All sections are properly aligned
- [ ] No overlapping elements
- [ ] Proper spacing between elements
- [ ] Buttons are properly sized

### Responsive Behavior
- [ ] Settings window can be resized (if applicable)
- [ ] Elements reflow properly
- [ ] No horizontal scrolling

---

## Performance Testing

### Load Time
- [ ] Settings page loads in < 1 second
- [ ] No noticeable lag when opening

### Button Response
- [ ] Buttons respond immediately to clicks
- [ ] No delay in showing toasts
- [ ] No UI freezing during operations

### Memory Usage
- [ ] No memory leaks after multiple open/close cycles
- [ ] Console shows no warnings about memory

---

## Final Verification

### Success Criteria:
- [ ] ✅ All 11 buttons respond to clicks
- [ ] ✅ All button actions execute correctly
- [ ] ✅ Success toast notifications appear for all actions
- [ ] ✅ Error toast notifications appear for failures
- [ ] ✅ All form inputs validate correctly
- [ ] ✅ Settings persist correctly after save
- [ ] ✅ No JavaScript errors in console
- [ ] ✅ All Material Icons load correctly
- [ ] ✅ Code is production-ready

---

## Issues Found

**Document any issues found during testing:**

| Issue # | Description | Severity | Status |
|---------|-------------|----------|--------|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## Testing Notes

**Add any additional notes or observations:**

---

**Testing Completed By:** _______________  
**Date:** _______________  
**Version Tested:** _______________  
**Overall Status:** [ ] PASS / [ ] FAIL

