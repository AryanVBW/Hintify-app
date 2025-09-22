// Notarize the mac build after signing using electron-builder hook
// Requires environment variables:
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID (optional but recommended)
//   or use keychain with ASC_PROVIDER
// Docs: https://www.electron.build/code-signing and https://github.com/electron/notarize

const { notarize } = require('@electron/notarize');

exports.default = async function notarizeHook(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = packager.appInfo.productFilename;

  // Skip notarization on PRs or when creds are missing
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const ascProvider = process.env.ASC_PROVIDER;

  if (!appleId || !appleIdPassword) {
    console.warn('[notarize] Skipping: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set');
    return;
  }

  console.log(`[notarize] Notarizing ${appName}.app in ${appOutDir}`);

  try {
    await notarize({
      appBundleId: packager.appInfo.appId,
      appPath: `${appOutDir}/${appName}.app`,
      appleId,
      appleIdPassword,
      teamId,
      ascProvider,
    });
    console.log('[notarize] Notarization complete');
  } catch (err) {
    console.error('[notarize] Failed:', err);
    throw err;
  }
};
