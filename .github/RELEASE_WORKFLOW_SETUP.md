# 🚀 GitHub Actions Release Workflow Setup Guide

This guide explains how to set up and use the automated macOS ARM64 build and release workflow for Hintify.

## 📋 Overview

The workflow automatically:
- ✅ Builds unsigned macOS ARM64 DMG and ZIP files
- ✅ Creates/updates GitHub releases
- ✅ Uploads build artifacts
- ✅ Runs on every push to `main` branch
- ✅ Can be triggered manually from GitHub Actions tab

## 🔧 Initial Setup

### Step 1: Enable GitHub Actions

1. Go to your repository on GitHub: `https://github.com/AryanVBW/Hintify-app`
2. Click on **Settings** tab
3. Click on **Actions** → **General** (left sidebar)
4. Under "Actions permissions", ensure **"Allow all actions and reusable workflows"** is selected
5. Scroll down to "Workflow permissions"
6. Select **"Read and write permissions"**
7. Check ✅ **"Allow GitHub Actions to create and approve pull requests"**
8. Click **Save**

### Step 2: Verify GITHUB_TOKEN Permissions (Important for Private Repos!)

The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub. However, for private repositories, you need to ensure it has the right permissions:

1. Go to **Settings** → **Actions** → **General**
2. Scroll to "Workflow permissions"
3. Make sure these are enabled:
   - ✅ Read and write permissions
   - ✅ Allow GitHub Actions to create and approve pull requests

**Note:** The `GITHUB_TOKEN` is automatically available in workflows - you don't need to create it manually!

### Step 3: Alternative - Use Personal Access Token (Optional)

If the default `GITHUB_TOKEN` doesn't work for your private repo, you can create a Personal Access Token:

1. Go to GitHub → Click your profile → **Settings**
2. Scroll down to **Developer settings** (bottom left)
3. Click **Personal access tokens** → **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. Give it a descriptive name: `Hintify Release Workflow`
6. Select **Expiration**: Choose your preference (90 days, 1 year, or no expiration)
7. Select scopes:
   - ✅ **`repo`** (Full control of private repositories) - **This is required!**
8. Click **Generate token**
9. **Copy the token immediately** (you won't see it again!)

#### Add Token as Repository Secret:

1. Go to your repository: `https://github.com/AryanVBW/Hintify-app`
2. Click **Settings** tab
3. Click **Secrets and variables** → **Actions** (left sidebar)
4. Click **New repository secret**
5. Name: `GH_RELEASE_TOKEN`
6. Value: Paste your personal access token
7. Click **Add secret**

#### Update Workflow to Use Custom Token:

If you created a custom token, edit `.github/workflows/release-macos-arm64.yml`:

```yaml
# Change this line in the "Create or Update Release" step:
token: ${{ secrets.GITHUB_TOKEN }}

# To:
token: ${{ secrets.GH_RELEASE_TOKEN }}
```

## 🎯 How to Use

### Automatic Trigger (Recommended)

Every time you push to the `main` branch, the workflow will automatically:
1. Build the latest code
2. Create/update a release with the version from `package.json`
3. Upload DMG and ZIP files

**Workflow:**
```bash
# Make your changes
git add .
git commit -m "feat: add new feature"
git push origin main

# GitHub Actions will automatically:
# - Build macOS ARM64 artifacts
# - Create release v1.0.9 (from package.json)
# - Upload artifacts to the release
```

### Manual Trigger

You can also trigger the build manually:

1. Go to your repository on GitHub
2. Click **Actions** tab
3. Click **Build & Release macOS ARM64** workflow (left sidebar)
4. Click **Run workflow** button (right side)
5. Select branch (usually `main`)
6. Click **Run workflow**

### Bump Version for New Release

To create a new release with a version bump:

```bash
# Option 1: Use npm version (automatic commit + tag)
npm version patch  # 1.0.9 → 1.0.10
npm version minor  # 1.0.9 → 1.1.0
npm version major  # 1.0.9 → 2.0.0

# Option 2: Manual edit
# Edit package.json version field manually
# Then commit and push

# Push changes
git push origin main

# The workflow will pick up the new version automatically
```

## 📦 What Gets Built

The workflow creates:
- **DMG file**: `Hintify-{version}-mac-arm64.dmg` (installer)
- **ZIP file**: `Hintify-{version}-mac-arm64.zip` (portable)
- **Blockmap**: For delta updates
- **latest-mac.yml**: Auto-updater metadata

All files are:
- ✅ Uploaded to GitHub Release
- ✅ Stored as workflow artifacts (30-day retention)

## 🔍 Monitoring Builds

### View Build Status

1. Go to **Actions** tab
2. Click on a workflow run
3. View logs for each step
4. Download artifacts if needed

### Check Release

1. Go to **Releases** section (right sidebar or `/releases` path)
2. Find your version tag (e.g., `v1.0.9`)
3. Download DMG or ZIP

## 🐛 Troubleshooting

### ❌ Workflow fails with "Resource not accessible by integration"

**Solution:** Enable write permissions for GITHUB_TOKEN:
1. Settings → Actions → General
2. Workflow permissions → "Read and write permissions"
3. Save and re-run the workflow

### ❌ Release not created

**Solution:** Use a Personal Access Token:
1. Follow Step 3 above to create `GH_RELEASE_TOKEN`
2. Update workflow to use `secrets.GH_RELEASE_TOKEN`

### ❌ Build fails with dependencies error

**Solution:** Clear cache and rebuild:
1. Go to Actions tab
2. Click "Caches" (left sidebar)
3. Delete npm cache
4. Re-run workflow

### ❌ Artifacts not found

**Solution:** Check the build step logs:
1. Click on failed workflow
2. Expand "Build unsigned macOS ARM64" step
3. Check if electron-builder completed successfully

## 📊 Build Environment

- **Runner**: `macos-14` (Apple Silicon / ARM64)
- **Node.js**: v20
- **Build time**: ~5-10 minutes
- **Build type**: Unsigned (no code signing/notarization)

## 🔒 Security Notes

- ✅ Token is stored securely in GitHub Secrets
- ✅ Token is never exposed in logs
- ✅ Token only has access to this repository
- ✅ Workflow runs in isolated environment

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Electron Builder Configuration](https://www.electron.build/)
- [Workflow File](.github/workflows/release-macos-arm64.yml)

## 🆘 Need Help?

If you encounter issues:
1. Check the Actions tab for detailed logs
2. Review this guide's troubleshooting section
3. Check GitHub Actions status page
4. Verify your repository settings match this guide

---

**Last Updated:** October 1, 2025  
**Workflow Version:** 1.0

