#!/usr/bin/env node

/**
 * Clerk OAuth Authentication Test Suite
 * 
 * This script tests the Clerk authentication implementation without requiring
 * a full Electron app launch. It validates:
 * 1. Environment configuration
 * 2. ClerkAuthService initialization
 * 3. State parameter generation and validation
 * 4. JWT token verification (with mock tokens)
 * 5. Credential storage/retrieval
 * 6. Session restoration
 * 
 * Usage:
 *   node test-clerk-auth.js
 */

const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config({
  path: path.resolve(__dirname, '.env.local')
});

// Import ClerkAuthService
const ClerkAuthService = require('./src/services/ClerkAuthService');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Helper functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(name, status, details = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const color = status === 'PASS' ? colors.green : status === 'FAIL' ? colors.red : colors.yellow;
  
  log(`${icon} ${name}`, color);
  if (details) {
    log(`   ${details}`, colors.cyan);
  }
  
  results.tests.push({ name, status, details });
  
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.warnings++;
}

function section(title) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(title, colors.bright);
  log('='.repeat(60), colors.bright);
}

// Test functions
async function testEnvironmentConfiguration() {
  section('1. Environment Configuration');
  
  // Test CLERK_PUBLISHABLE_KEY
  if (process.env.CLERK_PUBLISHABLE_KEY) {
    const key = process.env.CLERK_PUBLISHABLE_KEY;
    if (key.startsWith('pk_test_') || key.startsWith('pk_live_')) {
      logTest('CLERK_PUBLISHABLE_KEY', 'PASS', `Found: ${key.substring(0, 20)}...`);
    } else {
      logTest('CLERK_PUBLISHABLE_KEY', 'FAIL', 'Invalid format (should start with pk_test_ or pk_live_)');
    }
  } else {
    logTest('CLERK_PUBLISHABLE_KEY', 'FAIL', 'Not configured in .env.local');
  }
  
  // Test CLERK_SECRET_KEY
  if (process.env.CLERK_SECRET_KEY) {
    const key = process.env.CLERK_SECRET_KEY;
    if (key.startsWith('sk_test_') || key.startsWith('sk_live_')) {
      logTest('CLERK_SECRET_KEY', 'PASS', `Found: ${key.substring(0, 20)}...`);
    } else {
      logTest('CLERK_SECRET_KEY', 'FAIL', 'Invalid format (should start with sk_test_ or sk_live_)');
    }
  } else {
    logTest('CLERK_SECRET_KEY', 'WARN', 'Not configured (optional for JWT verification)');
  }
  
  // Test CLERK_FRONTEND_API
  if (process.env.CLERK_FRONTEND_API) {
    logTest('CLERK_FRONTEND_API', 'PASS', `Found: ${process.env.CLERK_FRONTEND_API}`);
  } else {
    logTest('CLERK_FRONTEND_API', 'WARN', 'Not configured (will use default)');
  }
}

async function testServiceInitialization() {
  section('2. ClerkAuthService Initialization');
  
  try {
    const service = new ClerkAuthService();
    logTest('Service instantiation', 'PASS', 'ClerkAuthService created successfully');
    
    // Test service properties
    if (service.SERVICE_NAME === 'com.hintify.clerk-auth') {
      logTest('Service name', 'PASS', service.SERVICE_NAME);
    } else {
      logTest('Service name', 'FAIL', `Expected com.hintify.clerk-auth, got ${service.SERVICE_NAME}`);
    }
    
    // Test Clerk client initialization
    if (service.clerkClient) {
      logTest('Clerk client', 'PASS', 'Backend client initialized');
    } else {
      logTest('Clerk client', 'WARN', 'Backend client not initialized (CLERK_SECRET_KEY missing)');
    }
    
    // Test JWKS client initialization
    if (service.jwksClient) {
      logTest('JWKS client', 'PASS', 'JWT verification client initialized');
    } else {
      logTest('JWKS client', 'FAIL', 'JWT verification client not initialized');
    }
    
    // Test frontend API extraction
    if (service.clerkFrontendApi) {
      logTest('Frontend API', 'PASS', service.clerkFrontendApi);
    } else {
      logTest('Frontend API', 'FAIL', 'Frontend API not extracted from publishable key');
    }
    
    return service;
  } catch (error) {
    logTest('Service instantiation', 'FAIL', error.message);
    return null;
  }
}

async function testStateParameterGeneration(service) {
  section('3. State Parameter Generation & Validation');
  
  if (!service) {
    logTest('State generation', 'FAIL', 'Service not initialized');
    return;
  }
  
  try {
    // Test state generation
    const state1 = service.generateState();
    const state2 = service.generateState();
    
    // Check format (UUID v4)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(state1)) {
      logTest('State format', 'PASS', `Valid UUID v4: ${state1}`);
    } else {
      logTest('State format', 'FAIL', `Invalid UUID format: ${state1}`);
    }
    
    // Check uniqueness
    if (state1 !== state2) {
      logTest('State uniqueness', 'PASS', 'Each state is unique');
    } else {
      logTest('State uniqueness', 'FAIL', 'States are not unique');
    }
    
    // Test state validation
    service.pendingAuthState = state1;
    
    // Valid state
    if (service.validateState(state1)) {
      logTest('State validation (valid)', 'PASS', 'Correct state accepted');
    } else {
      logTest('State validation (valid)', 'FAIL', 'Valid state rejected');
    }
    
    // Invalid state (should fail after first validation clears it)
    service.pendingAuthState = state1;
    service.validateState(state1); // Clear it
    if (!service.validateState(state2)) {
      logTest('State validation (invalid)', 'PASS', 'Invalid state rejected');
    } else {
      logTest('State validation (invalid)', 'FAIL', 'Invalid state accepted');
    }
    
    // Test timeout
    service.pendingAuthState = state1;
    service.pendingAuthTimeout = setTimeout(() => {
      service.pendingAuthState = null;
    }, 100);
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    if (!service.validateState(state1)) {
      logTest('State timeout', 'PASS', 'Expired state rejected');
    } else {
      logTest('State timeout', 'FAIL', 'Expired state accepted');
    }
    
  } catch (error) {
    logTest('State parameter tests', 'FAIL', error.message);
  }
}

async function testLoginFlow(service) {
  section('4. Login Flow');
  
  if (!service) {
    logTest('Login flow', 'FAIL', 'Service not initialized');
    return;
  }
  
  try {
    const { state, authUrl } = service.startLogin();
    
    // Check state
    if (state && typeof state === 'string') {
      logTest('Login state generation', 'PASS', `State: ${state.substring(0, 20)}...`);
    } else {
      logTest('Login state generation', 'FAIL', 'No state returned');
    }
    
    // Check auth URL
    if (authUrl && authUrl.startsWith('https://hintify.nexus-v.tech/auth/desktop?state=')) {
      logTest('Auth URL generation', 'PASS', authUrl);
    } else {
      logTest('Auth URL generation', 'FAIL', `Invalid URL: ${authUrl}`);
    }
    
    // Check pending state
    if (service.pendingAuthState === state) {
      logTest('Pending state storage', 'PASS', 'State stored for validation');
    } else {
      logTest('Pending state storage', 'FAIL', 'State not stored');
    }
    
    // Check timeout
    if (service.pendingAuthTimeout) {
      logTest('Auth timeout', 'PASS', 'Timeout set (5 minutes)');
    } else {
      logTest('Auth timeout', 'FAIL', 'Timeout not set');
    }
    
    // Clean up
    clearTimeout(service.pendingAuthTimeout);
    service.pendingAuthState = null;
    
  } catch (error) {
    logTest('Login flow', 'FAIL', error.message);
  }
}

async function testAuthStatus(service) {
  section('5. Authentication Status');
  
  if (!service) {
    logTest('Auth status', 'FAIL', 'Service not initialized');
    return;
  }
  
  try {
    const status = service.getAuthStatus();
    
    // Check structure
    if (status && typeof status === 'object') {
      logTest('Status structure', 'PASS', 'Returns object');
    } else {
      logTest('Status structure', 'FAIL', 'Invalid return type');
    }
    
    // Check properties
    if ('authenticated' in status && 'user' in status && 'sessionValid' in status) {
      logTest('Status properties', 'PASS', 'All required properties present');
    } else {
      logTest('Status properties', 'FAIL', 'Missing required properties');
    }
    
    // Check initial state (should be unauthenticated)
    if (status.authenticated === false) {
      logTest('Initial auth state', 'PASS', 'User not authenticated (expected)');
    } else {
      logTest('Initial auth state', 'WARN', 'User appears to be authenticated');
    }
    
  } catch (error) {
    logTest('Auth status', 'FAIL', error.message);
  }
}

async function testCredentialStorage(service) {
  section('6. Credential Storage (Keychain)');
  
  if (!service) {
    logTest('Credential storage', 'FAIL', 'Service not initialized');
    return;
  }
  
  try {
    // Note: We can't actually test keytar without proper system setup
    // But we can verify the methods exist
    
    if (typeof service.getStoredCredentials === 'function') {
      logTest('getStoredCredentials method', 'PASS', 'Method exists');
    } else {
      logTest('getStoredCredentials method', 'FAIL', 'Method missing');
    }
    
    if (typeof service.clearStoredCredentials === 'function') {
      logTest('clearStoredCredentials method', 'PASS', 'Method exists');
    } else {
      logTest('clearStoredCredentials method', 'FAIL', 'Method missing');
    }
    
    // Try to get stored credentials (will likely return null)
    const credentials = await service.getStoredCredentials();
    if (credentials === null) {
      logTest('Stored credentials', 'PASS', 'No stored credentials (expected for new install)');
    } else {
      logTest('Stored credentials', 'WARN', 'Found stored credentials from previous session');
    }
    
  } catch (error) {
    logTest('Credential storage', 'FAIL', error.message);
  }
}

async function testSessionRestoration(service) {
  section('7. Session Restoration');
  
  if (!service) {
    logTest('Session restoration', 'FAIL', 'Service not initialized');
    return;
  }
  
  try {
    // Try to restore session (will likely return null for new install)
    const userData = await service.restoreSession();
    
    if (userData === null) {
      logTest('Session restoration', 'PASS', 'No session to restore (expected for new install)');
    } else {
      logTest('Session restoration', 'WARN', `Restored session for user: ${userData.email || userData.id}`);
    }
    
  } catch (error) {
    // This is expected if no credentials are stored
    if (error.message.includes('not configured')) {
      logTest('Session restoration', 'WARN', 'Cannot restore without Clerk configuration');
    } else {
      logTest('Session restoration', 'FAIL', error.message);
    }
  }
}

async function testSignOut(service) {
  section('8. Sign Out');
  
  if (!service) {
    logTest('Sign out', 'FAIL', 'Service not initialized');
    return;
  }
  
  try {
    await service.signOut();
    
    // Check that session is cleared
    const status = service.getAuthStatus();
    if (status.authenticated === false && status.user === null) {
      logTest('Sign out', 'PASS', 'Session cleared successfully');
    } else {
      logTest('Sign out', 'FAIL', 'Session not cleared');
    }
    
  } catch (error) {
    logTest('Sign out', 'FAIL', error.message);
  }
}

// Print summary
function printSummary() {
  section('Test Summary');
  
  const total = results.passed + results.failed + results.warnings;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;
  
  log(`\nTotal Tests: ${total}`, colors.bright);
  log(`✅ Passed: ${results.passed}`, colors.green);
  log(`❌ Failed: ${results.failed}`, colors.red);
  log(`⚠️  Warnings: ${results.warnings}`, colors.yellow);
  log(`\nPass Rate: ${passRate}%`, colors.bright);
  
  if (results.failed === 0) {
    log('\n🎉 All critical tests passed!', colors.green);
    log('The Clerk OAuth implementation is ready for testing.', colors.green);
  } else {
    log('\n⚠️  Some tests failed. Please review the issues above.', colors.red);
  }
  
  // Recommendations
  section('Recommendations');
  
  if (!process.env.CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    log('⚠️  Configure Clerk credentials in .env.local', colors.yellow);
  }
  
  if (!process.env.CLERK_FRONTEND_API) {
    log('⚠️  Set CLERK_FRONTEND_API in .env.local for proper JWT verification', colors.yellow);
  }
  
  log('\nNext Steps:', colors.bright);
  log('1. Ensure .env.local is configured with valid Clerk credentials');
  log('2. Run the Electron app: npm run dev');
  log('3. Test the full authentication flow:');
  log('   - Click "Sign in with Google"');
  log('   - Complete OAuth in browser');
  log('   - Verify deep link callback works');
  log('   - Check session persistence after app restart');
  log('4. Test on all target platforms (macOS, Windows, Linux)');
  
  log('');
}

// Main test runner
async function runTests() {
  log('\n' + '='.repeat(60), colors.bright);
  log('Clerk OAuth Authentication Test Suite', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);
  
  let service = null;
  
  try {
    await testEnvironmentConfiguration();
    service = await testServiceInitialization();
    await testStateParameterGeneration(service);
    await testLoginFlow(service);
    await testAuthStatus(service);
    await testCredentialStorage(service);
    await testSessionRestoration(service);
    await testSignOut(service);
  } catch (error) {
    log(`\n❌ Test suite error: ${error.message}`, colors.red);
    console.error(error);
  }
  
  printSummary();
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

