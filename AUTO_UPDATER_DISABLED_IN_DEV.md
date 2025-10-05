# Auto-Updater Disabled in Development Mode

## ✅ Changes Implemented

The auto-updater functionality has been completely disabled when running the application in development mode to prevent unwanted behavior during development.

---

## 🔧 What Was Changed

### 1. **setupAutoUpdater() Function** (Line 1208-1211)
Added check at the beginning of the function:
```javascript
function setupAutoUpdater() {
  // Completely disable auto-updater in development mode
  if (isDevelopment || !app.isPackaged) {
    console.log('🚫 AutoUpdater: Disabled in development mode');
    return;
  }
  // ... rest of setup code
}
```

**Effect:** Auto-updater setup is completely skipped in development mode. No event listeners are attached, no periodic checks are scheduled.

---

### 2. **Initial Update Check** (Line 1398-1407)
Wrapped the initial update check in a production-only condition:
```javascript
// Initial update check for public repository (no token needed)
// Only run in production (packaged app)
if (!isDevelopment && app.isPackaged) {
  try {
    if (autoUpdater) {
      console.log('🔄 Scheduling initial update check in 3 seconds...');
      setTimeout(() => {
        console.log('🔍 Performing initial update check...');
        try { autoUpdater.checkForUpdates(); } catch (e) {
          console.error('❌ Initial update check failed:', e);
        }
      }, 3000);
    }
  } catch (e) {
    console.error('❌ Failed to schedule initial update check:', e);
  }
} else {
  console.log('🚫 Initial update check: Skipped (development mode)');
}
```

**Effect:** The 3-second delayed update check that runs on app startup is completely skipped in development mode.

---

### 3. **Secondary Update Check** (Line 1424-1428)
Added production-only condition:
```javascript
// Initialize auto-updater and perform an initial check (if not dismissed recently)
// Only in production mode
setupAutoUpdater();
if (!isDevelopment && app.isPackaged) {
  try {
    if (autoUpdater) {
      const dismissedUntil = store.get('update_dismissed_until', 0);
      if (!dismissedUntil || Date.now() > dismissedUntil) {
        autoUpdater.checkForUpdates();
      }
    }
  } catch {}
}
```

**Effect:** The secondary update check (respecting user's "update later" preference) is also skipped in development mode.

---

### 4. **IPC Handler: check-for-updates** (Line 597-604)
Added development mode check at the beginning:
```javascript
ipcMain.handle('check-for-updates', async () => {
  // Disable in development mode
  if (isDevelopment || !app.isPackaged) {
    console.log('🚫 Update check: Disabled in development mode');
    return { success: false, unsupported: true, error: 'Auto-updater disabled in development mode' };
  }
  // ... rest of handler
});
```

**Effect:** When the renderer process calls `ipcRenderer.invoke('check-for-updates')`, it immediately returns an error in development mode without attempting to check for updates.

---

### 5. **IPC Handler: download-update** (Line 639-644)
Added development mode check:
```javascript
ipcMain.on('download-update', () => {
  // Disable in development mode
  if (isDevelopment || !app.isPackaged) {
    console.log('🚫 Download update: Disabled in development mode');
    return;
  }
  // ... rest of handler
});
```

**Effect:** Download requests are ignored in development mode.

---

### 6. **IPC Handler: install-update** (Line 654-659)
Added development mode check:
```javascript
ipcMain.on('install-update', () => {
  // Disable in development mode
  if (isDevelopment || !app.isPackaged) {
    console.log('🚫 Install update: Disabled in development mode');
    return;
  }
  // ... rest of handler
});
```

**Effect:** Install requests are ignored in development mode.

---

### 7. **Menu Item: Check for Updates** (Line 985-997)
Added development mode check:
```javascript
{
  label: 'Check for Updates…',
  click: () => {
    try {
      // Disable in development mode
      if (isDevelopment || !app.isPackaged) {
        console.log('🚫 Check for updates (menu): Disabled in development mode');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-status', { status: 'unsupported' });
        }
        return;
      }
      // ... rest of handler
    }
  }
}
```

**Effect:** When user clicks "Check for Updates…" in the Help menu during development, it immediately returns without checking.

---

## 🎯 Development Mode Detection

The application uses two methods to detect development mode:

### Method 1: Command Line Argument
```javascript
isDevelopment = process.argv.includes('--development')
```
- Triggered by: `electron . --development`
- Used by: `npm run dev` script

### Method 2: Environment Variable
```javascript
isDevelopment = process.env.NODE_ENV === 'development'
```
- Triggered by: `NODE_ENV=development`
- Set in: `package.json` dev script

### Method 3: Packaged Status
```javascript
app.isPackaged === false
```
- Returns `false` when running from source code
- Returns `true` only when running from packaged app (`.app`, `.exe`, etc.)

### Combined Check
All auto-updater code uses:
```javascript
if (isDevelopment || !app.isPackaged) {
  // Skip auto-updater
}
```

This ensures auto-updater is disabled if **ANY** of these conditions are true:
- ✅ `--development` flag is present
- ✅ `NODE_ENV=development` is set
- ✅ App is not packaged (running from source)

---

## 📊 Console Output in Development Mode

When running `npm run dev`, you should now see these messages:

### On App Startup:
```
Development mode: true
🚫 Initial update check: Skipped (development mode)
🚫 AutoUpdater: Disabled in development mode
```

### When Settings Page Tries to Check for Updates:
```
🚫 Update check: Disabled in development mode
```

### When User Clicks "Check for Updates…" Menu:
```
🚫 Check for updates (menu): Disabled in development mode
```

### When Download/Install is Attempted:
```
🚫 Download update: Disabled in development mode
🚫 Install update: Disabled in development mode
```

---

## ✅ What This Prevents

### In Development Mode (`npm run dev`):
- ❌ No auto-updater initialization
- ❌ No event listeners attached to autoUpdater
- ❌ No periodic update checks (6-hour interval)
- ❌ No initial update check on startup
- ❌ No update checks from settings page
- ❌ No update checks from Help menu
- ❌ No update downloads
- ❌ No update installations
- ❌ No network requests to GitHub releases API
- ❌ No file modifications or downloads

### In Production Mode (Packaged App):
- ✅ Auto-updater initializes normally
- ✅ Event listeners attached
- ✅ Periodic checks every 6 hours
- ✅ Initial check on startup
- ✅ Manual checks from settings/menu work
- ✅ Downloads and installations work
- ✅ Full update functionality available

---

## 🧪 How to Test

### Test 1: Development Mode (Should Be Disabled)
```bash
npm run dev
```

**Expected Console Output:**
```
Development mode: true
🚫 Initial update check: Skipped (development mode)
🚫 AutoUpdater: Disabled in development mode
```

**Expected Behavior:**
- No update checks occur
- Settings page shows "Auto-updater disabled in development mode"
- Help menu "Check for Updates…" does nothing

---

### Test 2: Production Mode (Should Work)
```bash
# Build the app first
npm run build

# Run the packaged app
# On macOS: open dist/mac/Hintify.app
# On Windows: dist/win/Hintify.exe
# On Linux: dist/linux/hintify
```

**Expected Console Output:**
```
Development mode: false
🔄 Setting up auto-updater for public GitHub repository...
✅ Auto-updater configured for public repository: AryanVBW/Hintify-app
🔄 Scheduling initial update check in 3 seconds...
🔍 Performing initial update check...
```

**Expected Behavior:**
- Auto-updater initializes
- Update checks occur
- Settings page shows update status
- Help menu "Check for Updates…" works

---

## 📝 Files Modified

### Modified:
- ✅ `src/main.js` - Added development mode checks to all auto-updater code

### Created:
- ✅ `AUTO_UPDATER_DISABLED_IN_DEV.md` - This documentation

---

## 🔍 Code Locations

All changes are in `src/main.js`:

| Line Range | Description |
|------------|-------------|
| 1208-1211 | setupAutoUpdater() - Early return in dev mode |
| 1398-1407 | Initial update check - Wrapped in production check |
| 1424-1428 | Secondary update check - Wrapped in production check |
| 597-604 | IPC: check-for-updates - Early return in dev mode |
| 639-644 | IPC: download-update - Early return in dev mode |
| 654-659 | IPC: install-update - Early return in dev mode |
| 985-997 | Menu: Check for Updates - Early return in dev mode |

---

## 🎉 Benefits

### For Developers:
- ✅ No unwanted update checks during development
- ✅ No network requests to GitHub API
- ✅ No file downloads or modifications
- ✅ Faster app startup (no update check delay)
- ✅ Cleaner console output
- ✅ No interference with hot-reload or debugging

### For Production:
- ✅ Full auto-updater functionality preserved
- ✅ All update features work as expected
- ✅ No changes to production behavior
- ✅ Users still get automatic updates

---

## 🚀 Next Steps

1. **Test in Development:**
   ```bash
   npm run dev
   ```
   Verify console shows: `🚫 AutoUpdater: Disabled in development mode`

2. **Test Settings Page:**
   - Open settings
   - Click "Check for Updates"
   - Should show: "Auto-updater disabled in development mode"

3. **Test Help Menu:**
   - Click Help → Check for Updates…
   - Should do nothing (no update check)

4. **Commit Changes:**
   ```bash
   git add src/main.js AUTO_UPDATER_DISABLED_IN_DEV.md
   git commit -m "fix: Disable auto-updater in development mode"
   git push origin main
   ```

---

## 📚 Related Documentation

- **Electron Auto-Updater:** https://www.electronjs.org/docs/latest/api/auto-updater
- **electron-updater:** https://www.electron.build/auto-update
- **Development vs Production:** https://www.electronjs.org/docs/latest/tutorial/application-distribution

---

**Status:** ✅ Complete  
**Tested:** Ready for testing  
**Production Impact:** None (only affects development mode)  
**Breaking Changes:** None

---

*Auto-updater is now completely disabled in development mode while remaining fully functional in production builds.*

