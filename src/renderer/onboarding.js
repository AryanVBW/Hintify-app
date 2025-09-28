const { ipcRenderer, shell } = require('electron');
const { spawn } = require('child_process');
const Store = require('electron-store');
const axios = require('axios');
const os = require('os');
const path = require('path');

// Initialize store
const store = new Store();

// Global state
let currentStep = 1;
let setupProgress = {
    dependencies: {
        tesseract: false,
        homebrew: false
    },
    permissions: {
        screen: false,
        accessibility: false
    },
    configuration: {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        theme: 'dark',
        apiKey: ''
    }
};

// Platform detection
const platform = process.platform;
const isMac = platform === 'darwin';
const isWindows = platform === 'win32';
const isLinux = platform === 'linux';

// Initialize onboarding
function initializeOnboarding() {
    // Set default theme
    document.body.className = 'theme-dark';
    // Ensure full-screen layout for better visibility
    document.body.classList.add('full-screen');
    
    // Load app logo
    loadOnboardingLogo();
    
    // Show platform-specific elements
    setupPlatformElements();
    
    // Start dependency checks
    checkAllDependencies();
    
    // Setup event listeners
    setupEventListeners();
    setupKeyboardNavigation();
    
    // Show first step
    goToStep(1);
}

// Load onboarding logo
function loadOnboardingLogo() {
    try {
        const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
        const basePath = isDev ? '../../assets/' : (process.resourcesPath + '/assets/');

        const logo = document.getElementById('onboarding-logo');
        if (logo) {
            logo.src = path.join(basePath, 'logo_m.png');
        }
        const ocr = document.getElementById('ocr-icon');
        if (ocr) {
            ocr.src = path.join(basePath, 'ocr-64.png');
        }
    } catch (error) {
        console.error('Error loading onboarding logo:', error);
        const logo = document.getElementById('onboarding-logo');
        if (logo) logo.src = '../../assets/logo_m.png';
        const ocr = document.getElementById('ocr-icon');
        if (ocr) ocr.src = '../../assets/ocr-64.png';
    }
}

// Get logo path for permission instructions
function getLogoPath() {
    try {
        const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
        const basePath = isDev ? '../../assets/' : (process.resourcesPath + '/assets/');
        return path.join(basePath, 'logo_m.png');
    } catch (error) {
        console.error('Error getting logo path:', error);
        return '../../assets/logo_m.png';
    }
}

// Show permission feedback
function showPermissionFeedback(permissionType, status) {
    const statusEl = document.getElementById(`${permissionType}-status`);
    if (!statusEl) return;

    switch (status) {
        case 'opening':
            statusEl.innerHTML = '<div class="status-checking">Opening System Preferences...</div>';
            break;
        case 'granted':
            statusEl.innerHTML = '<div class="status-success">✓ Permission Granted</div>';
            break;
        case 'denied':
            statusEl.innerHTML = '<div class="status-error">✗ Permission Denied</div>';
            break;
        case 'checking':
            statusEl.innerHTML = '<div class="status-checking">Checking...</div>';
            break;
        default:
            statusEl.innerHTML = '<div class="status-warning">⚠ Needs Permission</div>';
    }
}

// Setup platform-specific elements
function setupPlatformElements() {
    const homebrewCheck = document.getElementById('homebrew-check');
    const accessibilityPermission = document.getElementById('accessibility-permission');
    
    if (isMac) {
        if (homebrewCheck) homebrewCheck.style.display = 'block';
        if (accessibilityPermission) accessibilityPermission.style.display = 'block';
    }
}

// Check all dependencies
async function checkAllDependencies() {
    await checkTesseract();
    if (isMac) {
        await checkHomebrew();
    }
    updateDependenciesStep();
}

// Update dependencies step status
function updateDependenciesStep() {
    const continueBtn = document.getElementById('continue-dependencies');
    const tesseract = setupProgress.dependencies.tesseract;
    
    // Enable continue button if Tesseract is satisfied or user wants to skip
    if (tesseract) {
        continueBtn.disabled = false;
        continueBtn.setAttribute('aria-disabled', 'false');
    } else {
        continueBtn.setAttribute('aria-disabled', 'true');
    }
}

// Check Tesseract OCR
async function checkTesseract() {
    const statusEl = document.getElementById('tesseract-status');
    const detailsEl = document.getElementById('tesseract-details');
    const instructionsEl = document.getElementById('tesseract-instructions');
    const installBtn = document.getElementById('tesseract-install-btn');
    const recheckBtn = document.getElementById('tesseract-recheck-btn');
    const item = document.getElementById('tesseract-check');
    
    let isInstalled = await checkTesseractInstalled();
    // Treat built-in Tesseract.js as satisfying OCR requirement
    if (!isInstalled) {
        try {
            require('tesseract.js');
            isInstalled = true;
        } catch (e) {
            console.debug('Bundled OCR not available:', e?.message || e);
        }
    }
    
    if (isInstalled) {
        statusEl.innerHTML = '<div class="status-success">✓ Available</div>';
        item.classList.add('success');
        setupProgress.dependencies.tesseract = true;
    } else {
        statusEl.innerHTML = '<div class="status-error">✗ Not Installed</div>';
        instructionsEl.innerHTML = getTesseractInstallInstructions();
        if (installBtn) installBtn.style.display = 'inline-block';
        detailsEl.style.display = 'block';
        item.classList.add('error');
    }
    
    if (recheckBtn) {
        recheckBtn.onclick = () => checkTesseract();
    }
    
    if (installBtn) {
        installBtn.onclick = () => installTesseract();
    }
}

// Check if Tesseract is installed
function checkTesseractInstalled() {
    return new Promise((resolve) => {
        const process = spawn('tesseract', ['--version'], { stdio: 'pipe' });
        
        process.on('close', (code) => {
            resolve(code === 0);
        });
        
        process.on('error', () => {
            resolve(false);
        });
    });
}

// Get Tesseract install instructions
function getTesseractInstallInstructions() {
    if (isMac) {
        return `
            <p><strong>Using Homebrew (recommended):</strong></p>
            <code>brew install tesseract</code>
            <p><strong>Using MacPorts:</strong></p>
            <code>sudo port install tesseract</code>
        `;
    } else if (isWindows) {
        return `
            <p><strong>Option 1: Using Chocolatey</strong></p>
            <code>choco install tesseract</code>
            <p><strong>Option 2: Manual Download</strong></p>
            <p>Download from <a href="https://github.com/UB-Mannheim/tesseract/wiki" target="_blank">UB Mannheim Tesseract</a></p>
        `;
    } else {
        return `
            <p><strong>Ubuntu/Debian:</strong></p>
            <code>sudo apt-get install tesseract-ocr</code>
            <p><strong>CentOS/RHEL:</strong></p>
            <code>sudo yum install tesseract</code>
            <p><strong>Arch Linux:</strong></p>
            <code>sudo pacman -S tesseract</code>
        `;
    }
}

// Install Tesseract
async function installTesseract() {
    if (isMac) {
        // Try to install via Homebrew if available
        try {
            if (await checkHomebrew()) {
                runTerminalCommand('brew install tesseract');
            } else {
                shell.openExternal('https://github.com/tesseract-ocr/tesseract');
            }
        } catch (e) {
            console.error('Error checking Homebrew:', e);
            shell.openExternal('https://github.com/tesseract-ocr/tesseract');
        }
    } else if (isWindows) {
        shell.openExternal('https://github.com/UB-Mannheim/tesseract/wiki');
    } else {
        // Open documentation for Linux
        shell.openExternal('https://github.com/tesseract-ocr/tesseract');
    }
}

// Check Homebrew (macOS only)
async function checkHomebrew() {
    if (!isMac) return false;
    
    const statusEl = document.getElementById('homebrew-status');
    const detailsEl = document.getElementById('homebrew-details');
    const instructionsEl = document.getElementById('homebrew-instructions');
    const installBtn = document.getElementById('homebrew-install-btn');
    const recheckBtn = document.getElementById('homebrew-recheck-btn');
    const item = document.getElementById('homebrew-check');
    
    const isInstalled = await checkHomebrewInstalled();
    
    if (isInstalled) {
        statusEl.innerHTML = '<div class="status-success">✓ Installed</div>';
        item.classList.add('success');
        setupProgress.dependencies.homebrew = true;
        return true;
    } else {
        statusEl.innerHTML = '<div class="status-warning">⚠ Not Installed</div>';
        instructionsEl.innerHTML = `
            <p>Homebrew makes it easy to install dependencies like Tesseract and Ollama:</p>
            <code>/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"</code>
        `;
        installBtn.style.display = 'inline-block';
        detailsEl.style.display = 'block';
        item.classList.add('error');
    }
    
    if (recheckBtn) {
        recheckBtn.onclick = () => checkHomebrew();
    }
    
    if (installBtn) {
        installBtn.onclick = () => installHomebrew();
    }
    
    return false;
}

// Check if Homebrew is installed
function checkHomebrewInstalled() {
    return new Promise((resolve) => {
        const process = spawn('which', ['brew'], { stdio: 'pipe' });
        
        process.on('close', (code) => {
            resolve(code === 0);
        });
        
        process.on('error', () => {
            resolve(false);
        });
    });
}

// Install Homebrew
function installHomebrew() {
    shell.openExternal('https://brew.sh');
}

// Run terminal command (macOS/Linux)
function runTerminalCommand(command) {
    if (isMac) {
        const script = `tell application "Terminal" to do script "${command}"`;
        spawn('osascript', ['-e', script]);
    } else if (isLinux) {
        spawn('gnome-terminal', ['--', 'bash', '-c', command + '; read -p "Press Enter to continue..."']);
    }
}

// Check permissions (Step 2)
async function checkPermissions() {
    // Smart, on-demand permissions: do not request during onboarding
    try {
        const screenStatus = document.getElementById('screen-status');
        const screenItem = document.getElementById('screen-permission');
        const screenDetails = document.getElementById('screen-details');
        const screenBtn = document.getElementById('screen-permission-btn');

        const accStatus = document.getElementById('accessibility-status');
        const accItem = document.getElementById('accessibility-permission');
        const accDetails = document.getElementById('accessibility-details');
        const accBtn = document.getElementById('accessibility-permission-btn');

        // Communicate that permissions will be requested when needed
        if (screenStatus) screenStatus.innerHTML = '<div class="status-warning">Will be requested on first use</div>';
        if (accStatus) accStatus.innerHTML = '<div class="status-warning">Will be requested on first use</div>';

        // Visually mark as OK to continue without prompting now
        screenItem?.classList.remove('error');
        screenItem?.classList.add('success');
        accItem?.classList.remove('error');
        accItem?.classList.add('success');

        // Hide extra details and action buttons during onboarding
        if (screenDetails) screenDetails.style.display = 'none';
        if (screenBtn) screenBtn.style.display = 'none';
        if (accDetails) accDetails.style.display = 'none';
        if (accBtn) accBtn.style.display = 'none';

        // Mark as deferred-granted so the user can continue
        setupProgress.permissions.screen = true;
        if (isMac) {
            // Accessibility will be requested if an action actually needs it
            setupProgress.permissions.accessibility = true;
        }
    } catch (e) {
        // If anything fails, still allow skipping
        setupProgress.permissions.screen = true;
        if (isMac) setupProgress.permissions.accessibility = true;
    }

    updatePermissionsStep();
}

// Check screen recording permission (macOS) with enhanced feedback
async function checkScreenRecordingPermission() {
    const detailsEl = document.getElementById('screen-details');
    const permissionBtn = document.getElementById('screen-permission-btn');
    const item = document.getElementById('screen-permission');

    // Show checking status
    showPermissionFeedback('screen', 'checking');

    // Simulate permission check (in a real app, you'd use native APIs)
    setTimeout(() => {
        try {
            // For demo purposes, we'll assume permission is needed
            // In a real implementation, you would check actual system permissions
            const hasPermission = false; // This would be the actual check result

            if (hasPermission) {
                showPermissionFeedback('screen', 'granted');
                item.classList.remove('error');
                item.classList.add('success');
                detailsEl.style.display = 'none';
                setupProgress.permissions.screen = true;
            } else {
                showPermissionFeedback('screen', 'warning');
                detailsEl.style.display = 'block';
                item.classList.remove('success');
                item.classList.add('error');
                setupProgress.permissions.screen = false;

                if (permissionBtn) {
                    permissionBtn.onclick = () => requestScreenPermission();
                }
            }

            updatePermissionsStep();
        } catch (error) {
            console.error('Error checking screen recording permission:', error);
            showPermissionFeedback('screen', 'error');
        }
    }, 1000);
}

// Check accessibility permission (macOS) with enhanced feedback
async function checkAccessibilityPermission() {
    const detailsEl = document.getElementById('accessibility-details');
    const permissionBtn = document.getElementById('accessibility-permission-btn');
    const item = document.getElementById('accessibility-permission');

    // Show checking status
    showPermissionFeedback('accessibility', 'checking');

    // Simulate permission check (in a real app, you'd use native APIs)
    setTimeout(() => {
        try {
            // For demo purposes, we'll assume permission is needed
            // In a real implementation, you would check actual system permissions
            const hasPermission = false; // This would be the actual check result

            if (hasPermission) {
                showPermissionFeedback('accessibility', 'granted');
                item.classList.remove('error');
                item.classList.add('success');
                detailsEl.style.display = 'none';
                setupProgress.permissions.accessibility = true;
            } else {
                showPermissionFeedback('accessibility', 'warning');
                detailsEl.style.display = 'block';
                item.classList.remove('success');
                item.classList.add('error');
                setupProgress.permissions.accessibility = false;

                if (permissionBtn) {
                    permissionBtn.onclick = () => requestAccessibilityPermission();
                }
            }

            updatePermissionsStep();
        } catch (error) {
            console.error('Error checking accessibility permission:', error);
            showPermissionFeedback('accessibility', 'error');
        }
    }, 1200);
}

// Request screen recording permission with enhanced UI
function requestScreenPermission() {
    if (isMac) {
        // Open System Preferences to Privacy settings
        spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture']);

        // Update UI to show enhanced instruction with app logo
        const logoPath = getLogoPath();
        document.getElementById('screen-details').innerHTML = `
            <div class="permission-instruction-card">
                <div class="permission-instruction-header">
                    <img src="${logoPath}" alt="Hintify SnapAssist AI" class="permission-app-logo">
                    <h4>Grant Screen Recording Permission</h4>
                </div>
                <div class="permission-steps">
                    <div class="step-item">
                        <span class="step-number">1</span>
                        <span class="step-text">System Preferences will open automatically</span>
                    </div>
                    <div class="step-item">
                        <span class="step-number">2</span>
                        <span class="step-text">Navigate to <strong>Privacy & Security</strong> → <strong>Screen Recording</strong></span>
                    </div>
                    <div class="step-item">
                        <span class="step-number">3</span>
                        <span class="step-text">Find and check the box next to <strong>"Hintify SnapAssist AI"</strong></span>
                    </div>
                    <div class="step-item">
                        <span class="step-number">4</span>
                        <span class="step-text">Enter your password if prompted</span>
                    </div>
                </div>
                <div class="permission-actions">
                    <button class="btn btn-primary" onclick="checkScreenRecordingPermission()">
                        <span>✓</span> I've granted permission
                    </button>
                    <button class="btn btn-secondary" onclick="requestScreenPermission()">
                        <span>🔄</span> Open System Preferences again
                    </button>
                </div>
            </div>
        `;

        // Add visual feedback
        showPermissionFeedback('screen', 'opening');
    }
}

// Request accessibility permission with enhanced UI
function requestAccessibilityPermission() {
    if (isMac) {
        // Open System Preferences to Accessibility settings
        spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility']);

        // Update UI to show enhanced instruction with app logo
        const logoPath = getLogoPath();
        document.getElementById('accessibility-details').innerHTML = `
            <div class="permission-instruction-card">
                <div class="permission-instruction-header">
                    <img src="${logoPath}" alt="Hintify SnapAssist AI" class="permission-app-logo">
                    <h4>Grant Accessibility Permission</h4>
                </div>
                <div class="permission-steps">
                    <div class="step-item">
                        <span class="step-number">1</span>
                        <span class="step-text">System Preferences will open automatically</span>
                    </div>
                    <div class="step-item">
                        <span class="step-number">2</span>
                        <span class="step-text">Navigate to <strong>Privacy & Security</strong> → <strong>Accessibility</strong></span>
                    </div>
                    <div class="step-item">
                        <span class="step-number">3</span>
                        <span class="step-text">Find and check the box next to <strong>"Hintify SnapAssist AI"</strong></span>
                    </div>
                    <div class="step-item">
                        <span class="step-number">4</span>
                        <span class="step-text">Enter your password when prompted</span>
                    </div>
                </div>
                <div class="permission-actions">
                    <button class="btn btn-primary" onclick="checkAccessibilityPermission()">
                        <span>✓</span> I've granted permission
                    </button>
                    <button class="btn btn-secondary" onclick="requestAccessibilityPermission()">
                        <span>🔄</span> Open System Preferences again
                    </button>
                </div>
            </div>
        `;

        // Add visual feedback
        showPermissionFeedback('accessibility', 'opening');
    }
}

// Update permissions step status
function updatePermissionsStep() {
    const continueBtn = document.getElementById('continue-permissions');
    if (!continueBtn) return;

    // Check if all required permissions are granted
    const allPermissionsGranted = isMac ?
        (setupProgress.permissions.screen && setupProgress.permissions.accessibility) :
        setupProgress.permissions.screen;

    if (allPermissionsGranted) {
        continueBtn.disabled = false;
        continueBtn.textContent = '✓ Continue to AI Provider';
        continueBtn.classList.add('btn-success');
        continueBtn.setAttribute('aria-disabled', 'false');
    } else {
        continueBtn.disabled = false; // Allow users to continue even without permissions
        continueBtn.textContent = 'Continue (Skip Permissions)';
        continueBtn.classList.remove('btn-success');
        continueBtn.setAttribute('aria-disabled', 'false');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Navigation arrows
    document.getElementById('nav-arrow-left')?.addEventListener('click', () => {
        const currentStep = getCurrentStep();
        if (currentStep > 1) {
            goToStep(currentStep - 1);
        }
    });

    document.getElementById('nav-arrow-right')?.addEventListener('click', () => {
        const currentStep = getCurrentStep();
        if (currentStep < 5) {
            goToStep(currentStep + 1);
        }
    });

    // Navigation buttons - Step 1 to 2
    document.getElementById('continue-dependencies')?.addEventListener('click', () => goToStep(2));
    document.getElementById('skip-dependencies')?.addEventListener('click', () => goToStep(2));

    // Navigation buttons - Step 2 to 3
    document.getElementById('back-to-dependencies')?.addEventListener('click', () => goToStep(1));
    document.getElementById('continue-permissions')?.addEventListener('click', () => goToStep(3));

    // Navigation buttons - Step 3 to 4
    document.getElementById('back-provider')?.addEventListener('click', () => goToStep(2));
    document.getElementById('continue-config')?.addEventListener('click', () => goToStep(4));

    // Navigation buttons - Step 4 to 5
    document.getElementById('back-config')?.addEventListener('click', () => goToStep(3));
    document.getElementById('finish-setup')?.addEventListener('click', () => goToStep(5));

    // Final step
    document.getElementById('start-app')?.addEventListener('click', () => finishSetup());
    
    // Dependency item clicks
    document.querySelectorAll('.dependency-header').forEach(header => {
        header.addEventListener('click', () => {
            const details = header.parentNode.querySelector('.dependency-details');
            if (details) {
                details.style.display = details.style.display === 'none' ? 'block' : 'none';
            }
        });
    });
    
    // Permission item clicks
    document.querySelectorAll('.permission-header').forEach(header => {
        header.addEventListener('click', () => {
            const details = header.parentNode.querySelector('.permission-details');
            if (details) {
                details.style.display = details.style.display === 'none' ? 'block' : 'none';
            }
        });
    });
}

// Keyboard navigation for seamless flow
function setupKeyboardNavigation() {
    const rightAction = () => {
        const step = getCurrentStep();
        if (step < 5) goToStep(step + 1);
    };
    const leftAction = () => {
        const step = getCurrentStep();
        if (step > 1) goToStep(step - 1);
    };

    window.addEventListener('keydown', (e) => {
        // Avoid hijacking when typing into inputs or selects
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select';
        if (isTyping) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            rightAction();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            leftAction();
        } else if (e.key === 'Enter') {
            // Map Enter to the primary action in each step
            const step = getCurrentStep();
            if (step === 1) {
                const cont = document.getElementById('continue-dependencies');
                if (cont && !cont.disabled) cont.click();
                else document.getElementById('skip-dependencies')?.click();
            }
            else if (step === 2) document.getElementById('continue-permissions')?.click();
            else if (step === 3) document.getElementById('continue-config')?.click();
            else if (step === 4) document.getElementById('finish-setup')?.click();
            else if (step === 5) document.getElementById('start-app')?.click();
        }
    });
}

// Go to specific step
function goToStep(step) {
    // Hide legacy and new containers
    document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.step-content').forEach(el => (el.style.display = 'none'));

    // Show target for steps 1-2 (legacy blocks)
    if (step === 1 || step === 2) {
        const block = document.getElementById(`setup-step-${step}`);
        if (block) block.classList.add('active');
    } else {
        // Show target for steps 3-5 (new blocks)
        const content = document.getElementById(`step-${step}-content`);
        if (content) content.style.display = 'block';
    }

    currentStep = step;
    updateProgress();
    updateNavigationArrows(step);

    // Scroll content to top for seamless transition
    const content = document.querySelector('.onboarding-content');
    try { content?.scrollTo({ top: 0, behavior: 'smooth' }); } catch { content && (content.scrollTop = 0); }

    // Focus primary action for the step to aid keyboard users
    setTimeout(() => {
        const focusMap = {
            1: '#continue-dependencies',
            2: '#continue-permissions',
            3: '#continue-config',
            4: '#finish-setup',
            5: '#start-app'
        };
        const selector = focusMap[step];
        const el = selector ? document.querySelector(selector) : null;
        if (el && !el.disabled) try { el.focus(); } catch {}
    }, 50);

    // Step-specific logic
    if (step === 2) {
        checkPermissions();
    } else if (step === 3) {
        setupProviderSelection();
    } else if (step === 4) {
        setupConfiguration();
    }
}

// Get current step number
function getCurrentStep() {
    return currentStep;
}

// Update navigation arrows visibility
function updateNavigationArrows(step) {
    const leftArrow = document.getElementById('nav-arrow-left');
    const rightArrow = document.getElementById('nav-arrow-right');

    if (leftArrow) {
        if (step <= 1) {
            leftArrow.classList.add('hidden');
        } else {
            leftArrow.classList.remove('hidden');
        }
    }

    if (rightArrow) {
        if (step >= 5) {
            rightArrow.classList.add('hidden');
        } else {
            rightArrow.classList.remove('hidden');
        }
    }
}

// Update progress indicator
function updateProgress() {
    // Update step indicators
    for (let i = 1; i <= 5; i++) {
        const stepEl = document.getElementById(`step-${i}`);
        if (stepEl) {
            stepEl.classList.remove('active', 'completed');
            if (i < currentStep) {
                stepEl.classList.add('completed');
            } else if (i === currentStep) {
                stepEl.classList.add('active');
            }
        }
    }
    
    // Update progress bar
    const progressFill = document.getElementById('progress-fill');
    if (progressFill) {
        const progress = ((currentStep - 1) / 4) * 100;
        progressFill.style.width = `${progress}%`;
    }
}

// Setup provider selection
function setupProviderSelection() {
    const providerOptions = document.querySelectorAll('.provider-option');
    const continueBtn = document.getElementById('continue-config');
    
    // Reset selection then preselect Gemini by default
    providerOptions.forEach(option => option.classList.remove('selected'));
    const defaultOption = document.querySelector('.provider-option[data-provider="gemini"]');
    if (defaultOption) {
        defaultOption.classList.add('selected');
        setupProgress.configuration.provider = 'gemini';
        if (continueBtn) {
            continueBtn.disabled = false;
            continueBtn.setAttribute('aria-disabled', 'false');
        }
    } else if (continueBtn) {
        continueBtn.disabled = true;
        continueBtn.setAttribute('aria-disabled', 'true');
    }
    
    // Handle provider selection
    providerOptions.forEach(option => {
        const select = () => {
            // Remove previous selection
            providerOptions.forEach(opt => opt.classList.remove('selected'));

            // Select this option
            option.classList.add('selected');

            // Update setup progress
            const provider = option.dataset.provider;
            setupProgress.configuration.provider = provider;

            // Enable continue button
            if (continueBtn) continueBtn.disabled = false;
            if (continueBtn) continueBtn.setAttribute('aria-disabled', 'false');
        };
        option.onclick = select;
        option.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select();
            }
        });
    });
    
    // Setup provider-specific buttons
    const geminiBtn = document.getElementById('setup-gemini-btn');
    if (geminiBtn) {
        geminiBtn.onclick = (e) => {
            e.stopPropagation();
            shell.openExternal('https://aistudio.google.com/app/apikey');
        };
    }
    const ollamaBtn = document.getElementById('setup-ollama-btn');
    if (ollamaBtn) {
        ollamaBtn.onclick = (e) => {
            e.stopPropagation();
            shell.openExternal('https://ollama.ai/download');
        };
    }
}

// Setup configuration
function setupConfiguration() {
    const provider = setupProgress.configuration.provider;
    const geminiConfig = document.getElementById('gemini-config');
    const ollamaConfig = document.getElementById('ollama-config');
    
    // Show appropriate config section
    if (provider === 'gemini') {
        geminiConfig.style.display = 'block';
        ollamaConfig.style.display = 'none';
        
        // Setup Gemini API key testing
        const testBtn = document.getElementById('test-gemini');
        const apiKeyInput = document.getElementById('gemini-api-key');
        const pasteBtn = document.getElementById('paste-api-key');
        const toggleBtn = document.getElementById('toggle-api-key-visibility');
        
        // Paste from clipboard functionality
        if (pasteBtn) {
            pasteBtn.addEventListener('click', async () => {
                try {
                    const { clipboard } = require('electron');
                    const text = clipboard.readText();
                    if (text && apiKeyInput) {
                        apiKeyInput.value = text.trim();
                        apiKeyInput.focus();
                        setupProgress.configuration.apiKey = text.trim();
                        
                        // Show success feedback
                        pasteBtn.textContent = '✅';
                        setTimeout(() => {
                            pasteBtn.textContent = '📋';
                        }, 1000);
                    } else {
                        // Show error feedback
                        pasteBtn.textContent = '❌';
                        setTimeout(() => {
                            pasteBtn.textContent = '📋';
                        }, 1000);
                    }
                } catch (error) {
                    console.error('Failed to paste from clipboard:', error);
                    pasteBtn.textContent = '❌';
                    setTimeout(() => {
                        pasteBtn.textContent = '📋';
                    }, 1000);
                }
            });
        }
        
        // Toggle API key visibility
        if (toggleBtn && apiKeyInput) {
            toggleBtn.addEventListener('click', () => {
                if (apiKeyInput.type === 'password') {
                    apiKeyInput.type = 'text';
                    toggleBtn.textContent = '🙈';
                    toggleBtn.title = 'Hide API key';
                } else {
                    apiKeyInput.type = 'password';
                    toggleBtn.textContent = '👁';
                    toggleBtn.title = 'Show API key';
                }
            });
        }
        
        testBtn.addEventListener('click', async () => {
            const apiKey = apiKeyInput.value.trim();
            if (!apiKey) {
                alert('Please enter an API key first');
                return;
            }
            
            testBtn.textContent = 'Testing...';
            testBtn.disabled = true;
            
            try {
                // Test API key with a simple request
                const response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
                    {
                        contents: [{
                            parts: [{ text: 'Hello' }]
                        }]
                    }
                );
                
                if (response.status === 200) {
                    setupProgress.configuration.apiKey = apiKey;
                    alert('API key is valid!');
                } else {
                    throw new Error('Invalid response');
                }
            } catch (error) {
                console.error('Gemini API key test failed:', error);
                alert('API key test failed. Please check your key.');
            } finally {
                testBtn.textContent = 'Test';
                testBtn.disabled = false;
            }
        });
        
        // Auto-save API key on change
        apiKeyInput.addEventListener('change', () => {
            setupProgress.configuration.apiKey = apiKeyInput.value.trim();
        });
        
        // Auto-save API key on input (real-time)
        apiKeyInput.addEventListener('input', () => {
            setupProgress.configuration.apiKey = apiKeyInput.value.trim();
        });
        
        // Enable keyboard shortcuts for API key field
        apiKeyInput.addEventListener('keydown', (e) => {
            // Allow Cmd+V / Ctrl+V for pasting
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                e.stopPropagation();
                // Let the default paste behavior work
                setTimeout(() => {
                    setupProgress.configuration.apiKey = apiKeyInput.value.trim();
                }, 10);
            }
        });
        
    } else if (provider === 'ollama') {
        geminiConfig.style.display = 'none';
        ollamaConfig.style.display = 'block';
        
        // Setup Ollama model selection
        const modelSelect = document.getElementById('ollama-model');
        modelSelect.addEventListener('change', () => {
            setupProgress.configuration.model = modelSelect.value;
        });
    }
    
    // Open external links
    document.getElementById('open-gemini-studio').addEventListener('click', (e) => {
        e.preventDefault();
        shell.openExternal('https://aistudio.google.com/app/apikey');
    });
}

// Finish setup
function finishSetup() {
    // Save configuration
    const config = {
        provider: setupProgress.configuration.provider,
        theme: setupProgress.configuration.theme,
        onboarding_completed: true
    };
    
    if (setupProgress.configuration.provider === 'gemini') {
        config.gemini_model = 'gemini-2.0-flash';
        if (setupProgress.configuration.apiKey) {
            config.gemini_api_key = setupProgress.configuration.apiKey;
        }
    } else {
        config.ollama_model = 'granite3.2-vision:2b';
    }
    
    // Save to store
    Object.keys(config).forEach(key => {
        store.set(key, config[key]);
    });
    
    // Send completion message to main process
    ipcRenderer.send('onboarding-completed', config);
    
    // Close onboarding window
    window.close();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeOnboarding();
});

// Export functions for potential use
module.exports = {
    checkTesseract,
    checkHomebrew,
    goToStep,
    finishSetup
};
