# ⚡ Quick Start - GitHub Actions Release

## 🚀 Enable in 3 Steps

### 1️⃣ Enable GitHub Actions Permissions
```
Repository Settings → Actions → General → Workflow permissions
✅ Select "Read and write permissions"
✅ Check "Allow GitHub Actions to create and approve pull requests"
💾 Click Save
```

### 2️⃣ Push to Main Branch
```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

### 3️⃣ Check Your Release
```
Go to: https://github.com/AryanVBW/Hintify-app/releases
```

That's it! 🎉

---

## 📦 What You Get

Every push to `main` automatically creates:
- ✅ macOS ARM64 DMG installer
- ✅ macOS ARM64 ZIP archive
- ✅ GitHub Release with version from `package.json`

---

## 🔄 Update Version

```bash
# Bump version (choose one)
npm version patch  # 1.0.9 → 1.0.10
npm version minor  # 1.0.9 → 1.1.0
npm version major  # 1.0.9 → 2.0.0

# Push
git push origin main
```

---

## 🐛 If It Fails

**Most common issue:** Missing permissions

**Fix:**
1. Go to: `Settings → Actions → General`
2. Set: "Read and write permissions"
3. Click: Save
4. Re-run: Go to Actions tab → Click failed run → Re-run jobs

**Still not working?** 
See detailed guide: `.github/RELEASE_WORKFLOW_SETUP.md`

---

## 📍 Important Files

- **Workflow:** `.github/workflows/release-macos-arm64.yml`
- **Full Guide:** `.github/RELEASE_WORKFLOW_SETUP.md`
- **Config:** `package.json` (version and build settings)

---

## 🎯 Manual Trigger

Don't want to push? Trigger manually:
```
Actions tab → "Build & Release macOS ARM64" → Run workflow
```

---

**Need more details?** Read the full setup guide in `.github/RELEASE_WORKFLOW_SETUP.md`

