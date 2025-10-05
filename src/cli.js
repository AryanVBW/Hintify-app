#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Import your existing services
const AuthService = require('./services/AuthService');
const DatabaseService = require('./services/DatabaseService');

program
  .name('hintify')
  .description('Hintify CLI - AI-powered homework hints')
  .version('1.0.9');

// Screenshot command
program
  .command('capture')
  .description('Capture screenshot and get hints')
  .option('-o, --output <path>', 'Output file path')
  .action(async (options) => {
    try {
      console.log('📸 Capturing screenshot...');
      
      if (process.platform === 'darwin') {
        // Use screencapture on macOS
        const tempFile = '/tmp/hintify-capture.png';
        const capture = spawn('screencapture', ['-i', tempFile]);
        
        capture.on('close', async (code) => {
          if (code === 0 && fs.existsSync(tempFile)) {
            const imageBuffer = fs.readFileSync(tempFile);
            await processImageCLI(imageBuffer, options.output);
            fs.unlinkSync(tempFile);
          } else {
            console.log('❌ Capture cancelled or failed');
          }
        });
      } else {
        console.log('❌ CLI capture not yet supported on this platform');
        console.log('💡 Use the GUI app for cross-platform screenshot capture');
      }
    } catch (error) {
      console.error('❌ Capture failed:', error.message);
    }
  });

// Process file command
program
  .command('process <file>')
  .description('Process an image file and get hints')
  .option('-o, --output <path>', 'Output file path')
  .action(async (file, options) => {
    try {
      if (!fs.existsSync(file)) {
        console.error('❌ File not found:', file);
        process.exit(1);
      }
      
      const imageBuffer = fs.readFileSync(file);
      await processImageCLI(imageBuffer, options.output);
    } catch (error) {
      console.error('❌ Processing failed:', error.message);
    }
  });

// Auth commands
program
  .command('login')
  .description('Login to your Hintify account')
  .action(async () => {
    console.log('🔐 Opening browser for authentication...');
    const { shell } = require('electron');
    await shell.openExternal('https://hintify.nexus-v.tech/sign-in?source=cli');
  });

program
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    try {
      const authService = new AuthService();
      const status = authService.getAuthStatus();
      
      if (status.authenticated) {
        console.log('✅ Authenticated');
        console.log(`📧 User: ${status.session?.user?.email ? 'Authenticated' : 'Unknown'}`);
      } else {
        console.log('❌ Not authenticated');
        console.log('💡 Run "hintify login" to sign in');
      }
    } catch (error) {
      console.error('❌ Status check failed:', error.message);
    }
  });

// Launch GUI app
program
  .command('gui')
  .description('Launch the Hintify desktop app')
  .action(() => {
    console.log('🚀 Launching Hintify desktop app...');
    
    if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Hintify'], { detached: true });
    } else if (process.platform === 'win32') {
      // Windows logic
      spawn('cmd', ['/c', 'start', 'hintify'], { detached: true });
    } else {
      // Linux logic
      spawn('hintify', [], { detached: true });
    }
  });

async function processImageCLI(imageBuffer, outputPath) {
  try {
    console.log('🤖 Processing image with AI...');
    
    // Use your existing AI processing logic
    // This would need to be extracted from renderer.js into a shared module
    
    const hints = "AI processing would go here...";
    
    if (outputPath) {
      fs.writeFileSync(outputPath, hints);
      console.log(`✅ Hints saved to: ${outputPath}`);
    } else {
      console.log('\n📝 Hints:');
      console.log(hints);
    }
  } catch (error) {
    console.error('❌ AI processing failed:', error.message);
  }
}

// Parse command line arguments
program.parse();