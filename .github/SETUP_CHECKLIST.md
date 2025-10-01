# ✅ GitHub Actions Setup Checklist

Use this checklist to ensure everything is configured correctly.

## 📋 Pre-Flight Checklist

### Repository Settings
- [ ] Repository is on GitHub
- [ ] You have admin access to the repository
- [ ] Repository is private (as mentioned)

### GitHub Actions Configuration
- [ ] **Step 1:** Go to `Settings` → `Actions` → `General`
- [ ] **Step 2:** Under "Actions permissions":
  - [ ] Select: "Allow all actions and reusable workflows"
- [ ] **Step 3:** Under "Workflow permissions":
  - [ ] Select: "Read and write permissions" ⚠️ **CRITICAL**
  - [ ] Check: "Allow GitHub Actions to create and approve pull requests"
- [ ] **Step 4:** Click "Save"

### Files Verification
- [ ] `.github/workflows/release-macos-arm64.yml` exists
- [ ] `package.json` has correct version number
- [ ] `electron-builder-dev.json` exists
- [ ] Build script exists: `npm run build-mac-arm64-prod-unsigned`

## 🚀 First Run

### Option A: Commit and Push (Recommended)
```bash
# 1. Stage the new workflow files
git add .github/

# 2. Commit
git commit -m "ci: add GitHub Actions workflow for macOS ARM64 releases"

# 3. Push to main
git push origin main

# 4. Check Actions tab on GitHub
# URL: https://github.com/AryanVBW/Hintify-app/actions
```

### Option B: Manual Trigger
```
1. Push the workflow file first (steps above)
2. Go to: https://github.com/AryanVBW/Hintify-app/actions
3. Click: "Build & Release macOS ARM64"
4. Click: "Run workflow" button
5. Select branch: main
6. Click: "Run workflow"
```

## ✅ Verification Steps

### After First Run
- [ ] Workflow appears in Actions tab
- [ ] Build completes successfully (green checkmark)
- [ ] Release appears in Releases section
- [ ] DMG file is in the release assets
- [ ] ZIP file is in the release assets
- [ ] Version matches `package.json`

### Check URLs
- [ ] Actions: `https://github.com/AryanVBW/Hintify-app/actions`
- [ ] Releases: `https://github.com/AryanVBW/Hintify-app/releases`
- [ ] Latest release: `https://github.com/AryanVBW/Hintify-app/releases/latest`

## 🐛 Common Issues & Fixes

### ❌ "Resource not accessible by integration"
```
FIX: Settings → Actions → General
     → Workflow permissions
     → "Read and write permissions"
     → Save
```

### ❌ Workflow doesn't appear in Actions tab
```
FIX: Make sure workflow file is pushed to main branch
     File must be in: .github/workflows/release-macos-arm64.yml
```

### ❌ Build fails with "permission denied"
```
FIX: Actions → Caches → Delete all caches
     Then re-run the workflow
```

### ❌ Release not created
```
Option 1: Check workflow permissions (see above)
Option 2: Create Personal Access Token:
  1. GitHub Profile → Settings
  2. Developer settings → Personal access tokens → Tokens (classic)
  3. Generate new token
  4. Select "repo" scope
  5. Copy token
  6. Repo Settings → Secrets → Actions
  7. New repository secret: GH_RELEASE_TOKEN
  8. Update workflow to use secrets.GH_RELEASE_TOKEN
```

## 📊 Success Indicators

You'll know it's working when:
- ✅ Green checkmark in Actions tab
- ✅ Release created with version tag (e.g., v1.0.9)
- ✅ DMG and ZIP files downloadable
- ✅ Build time: ~5-10 minutes
- ✅ Workflow runs automatically on push to main

## 🔄 Regular Usage

Once setup is complete:

```bash
# Make changes
git add .
git commit -m "feat: new feature"
git push origin main

# Wait 5-10 minutes
# Check: https://github.com/AryanVBW/Hintify-app/releases
```

To bump version:
```bash
npm version patch  # or minor, or major
git push origin main
```

## 📚 Documentation

- **Quick Start:** `.github/QUICK_START.md` (3 steps)
- **Full Guide:** `.github/RELEASE_WORKFLOW_SETUP.md` (detailed)
- **This Checklist:** `.github/SETUP_CHECKLIST.md`

## 🎯 Next Steps After Setup

1. [ ] Push workflow files to GitHub
2. [ ] Enable Actions permissions
3. [ ] Run first build
4. [ ] Verify release was created
5. [ ] Download and test DMG file
6. [ ] Share release link with users

## 💡 Tips

- **Workflow runs on every push to main** - be mindful of this
- **Manual trigger available** - Actions tab → Run workflow
- **Artifacts kept for 30 days** - in workflow artifacts section
- **Build is unsigned** - users need to right-click → Open first time
- **Version from package.json** - always kept in sync

---

**Setup Date:** _____________  
**First Successful Build:** _____________  
**Release URL:** https://github.com/AryanVBW/Hintify-app/releases

---

## ✉️ Questions?

Check the detailed guide: `.github/RELEASE_WORKFLOW_SETUP.md`

Happy releasing! 🚀

