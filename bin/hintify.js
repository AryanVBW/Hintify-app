#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// CLI launcher for Hintify Electron GUI
const packageJson = require('../package.json');

// Parse command line arguments
const args = process.argv.slice(2);
const helpFlags = ['-h', '--help'];
const versionFlags = ['-v', '--version'];

// Show help
if (args.some(arg => helpFlags.includes(arg))) {
  console.log(`
🎯 Hintify CLI Launcher v${packageJson.version}

DESCRIPTION:
  Launch the Hintify desktop GUI application for AI-powered homework hints
  
USAGE:
  npx hintify                 # Launch GUI app
  hintify                     # Launch GUI app (if installed globally)
  hintify --dev               # Launch in development mode
  hintify --version           # Show version
  hintify --help              # Show this help

OPTIONS:
  --dev                       Launch in development mode with debug features
  --headless                 Launch without showing window (background mode)
  --reset-permissions        Reset macOS screen recording permissions
  --config <path>            Use custom config file
  --data-dir <path>          Use custom data directory
  
EXAMPLES:
  npx hintify                 # Quick launch via npx
  npm install -g hintify      # Install globally
  hintify --dev               # Development mode
  hintify --reset-permissions # Fix macOS permissions

FEATURES:
  📸 Screenshot capture with AI hints
  🤖 Multiple AI providers (Gemini, Ollama)
  🔐 User authentication and progress tracking
  ⌨️  Global hotkeys (Cmd+Shift+H)
  🔄 Auto-updates and cloud sync

For more information, visit: ${packageJson.homepage}
`);
  process.exit(0);
}

// Show version
if (args.some(arg => versionFlags.includes(arg))) {
  console.log(`${packageJson.version}`);
  process.exit(0);
}

// Determine app root directory
const appRoot = path.join(__dirname, '..');
const mainScript = path.join(appRoot, 'src', 'main.js');

// Check if main script exists
if (!fs.existsSync(mainScript)) {
  console.error('❌ Error: Hintify app files not found.');
  console.error(`   Expected: ${mainScript}`);
  console.error('   Try reinstalling: npm install -g hintify');
  process.exit(1);
}

// Check if electron is available
const electronPath = require.resolve('electron');
if (!electronPath) {
  console.error('❌ Error: Electron not found.');
  console.error('   Try reinstalling: npm install -g hintify');
  process.exit(1);
}

// Handle special commands
if (args.includes('--reset-permissions')) {
  if (os.platform() === 'darwin') {
    console.log('🔄 Resetting macOS Screen Recording permissions...');
    const { execSync } = require('child_process');
    try {
      execSync('tccutil reset ScreenCapture com.hintify.snapassist', { stdio: 'inherit' });
      console.log('✅ Permissions reset. Launch the app to re-grant permissions.');
    } catch (error) {
      console.error('❌ Failed to reset permissions:', error.message);
    }
  } else {
    console.log('ℹ️  Permission reset is only available on macOS');
  }
  process.exit(0);
}

// Prepare electron arguments
const electronArgs = [mainScript];

// Parse custom arguments
const devMode = args.includes('--dev');
const headless = args.includes('--headless');
const configIndex = args.indexOf('--config');
const dataDirIndex = args.indexOf('--data-dir');

// Add development flag
if (devMode) {
  electronArgs.push('--development');
  process.env.NODE_ENV = 'development';
  console.log('🚀 Launching Hintify in development mode...');
} else {
  console.log('🎯 Launching Hintify...');
}

// Add headless flag
if (headless) {
  electronArgs.push('--headless');
  console.log('👻 Running in headless mode');
}

// Add custom config path
if (configIndex !== -1 && args[configIndex + 1]) {
  process.env.HINTIFY_CONFIG_PATH = args[configIndex + 1];
  console.log(`⚙️  Using config: ${args[configIndex + 1]}`);
}

// Add custom data directory
if (dataDirIndex !== -1 && args[dataDirIndex + 1]) {
  process.env.HINTIFY_DATA_DIR = args[dataDirIndex + 1];
  console.log(`📁 Using data directory: ${args[dataDirIndex + 1]}`);
}

// Launch Electron app
console.log('📱 Starting Hintify GUI...');

const child = spawn(electronPath, electronArgs, {
  stdio: 'inherit',
  env: { ...process.env },
  cwd: appRoot
});

// Handle process events
child.on('error', (error) => {
  console.error('❌ Failed to launch Hintify:', error.message);
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ Hintify exited with code ${code}`);
    process.exit(code);
  }
  console.log('👋 Hintify closed');
});

// Handle signals
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping Hintify...');
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Terminating Hintify...');
  child.kill('SIGTERM');
});