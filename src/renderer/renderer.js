const { ipcRenderer, clipboard, nativeImage, shell } = require('electron');
const Store = require('electron-store');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

// Initialize store
const store = new Store();

// Global variables
let currentConfig = {};
let isProcessing = false;
let userInfo = null;
let currentQuestionData = null; // Store current question for saving to database

// Default configuration
const defaultConfig = {
  provider: 'gemini',
  ollama_model: 'granite3.2-vision:2b',
  gemini_model: 'gemini-2.0-flash',
  theme: 'dark'
};

// Load configuration
function loadConfig() {
  const config = { ...defaultConfig };
  Object.keys(defaultConfig).forEach(key => {
    const stored = store.get(key);
    if (stored !== undefined) {
      config[key] = stored;
    }
  });
  currentConfig = config;
  return config;
}

// Save configuration
function saveConfig(config) {
  Object.keys(config).forEach(key => {
    store.set(key, config[key]);
  });
  currentConfig = { ...currentConfig, ...config };
}

// Apply theme to body
function applyTheme(theme) {
  document.body.className = `theme-${theme || 'dark'}`;
}

// Check authentication status
function checkAuthStatus() {
  const isAuthenticated = store.get('user_authenticated', false);
  const userData = store.get('user_info', null);
  
  console.log('🔍 Checking authentication status:', {
    isAuthenticated,
    hasUserData: !!userData,
    userEmail: userData?.email,
    userName: userData?.name || userData?.firstName,
    storedAt: userData?.authenticatedAt
  });
  
  if (isAuthenticated && userData) {
    console.log('✅ User is authenticated, setting up UI...');
    userInfo = userData;
    updateAuthUI(true, userData);
    return true;
  } else {
    console.log('❌ User not authenticated, showing sign-in UI');
    userInfo = null;
    updateAuthUI(false);
    return false;
  }
}

// Update authentication UI
function updateAuthUI(isAuthenticated, userData = null) {
  const authBtn = document.getElementById('auth-btn');
  const userInfoDiv = document.getElementById('user-info');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  
  console.log('🎨 Updating auth UI:', { isAuthenticated, userData });
  
  if (isAuthenticated && userData) {
    // Show user info, hide sign-in button
    if (authBtn) {
      authBtn.classList.add('hidden');
      console.log('🚫 Sign-in button hidden');
    }
    if (userInfoDiv) {
      userInfoDiv.classList.remove('hidden');
      console.log('✅ User info div shown');
    }
    
    // Update user avatar with better error handling
    if (userAvatar) {
      const imageUrl = userData.imageUrl || userData.avatar || userData.picture;
      if (imageUrl) {
        userAvatar.src = imageUrl;
        userAvatar.onerror = (e) => {
          console.warn('Avatar image failed to load, using fallback:', e);
          userAvatar.src = '../../assets/logo_m.png';
        };
        console.log('🖼️ Avatar set:', imageUrl);
      } else {
        userAvatar.src = '../../assets/logo_m.png'; // Default avatar
        console.log('🖼️ Using default avatar');
      }
    }
    
    // Update user name with comprehensive fallbacks
    if (userName) {
      const displayName = userData.name || 
                         userData.fullName ||
                         (userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : '') ||
                         userData.firstName ||
                         userData.displayName ||
                         userData.username ||
                         userData.email ||
                         'User';
      
      userName.textContent = displayName;
      userName.title = userData.email || displayName; // Show email on hover
      
      console.log('📝 User name set:', displayName, '(email:', userData.email, ')');
    }
    
    console.log('✅ User authenticated UI updated successfully');
  } else {
    // Show sign-in button, hide user info
    if (authBtn) {
      authBtn.classList.remove('hidden');
      console.log('✅ Sign-in button shown');
    }
    if (userInfoDiv) {
      userInfoDiv.classList.add('hidden');
      console.log('🚫 User info div hidden');
    }
    
    console.log('❌ User not authenticated - sign-in UI shown');
  }
}

// Handle sign-in button click
function handleSignIn() {
  console.log('🔐 Sign in requested from main app');
  
  // Open the website directly for authentication
  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
  const websiteUrl = isDev 
    ? 'http://localhost:3000/auth-success?source=app'
    : 'https://hintify.vercel.app/auth-success?source=app';
  
  console.log('Opening website URL:', websiteUrl, '(dev mode:', isDev, ')');
  
  updateStatus('Opening Hintify website...');
  
  shell.openExternal(websiteUrl).then(() => {
    updateStatus('Please complete sign-in in your browser');
  }).catch((error) => {
    console.error('Failed to open website:', error);
    updateStatus('Failed to open website. Please try again.');
  });
}

// Save question and answer to database
async function saveQuestionAnswer(questionText, answerText, questionType = 'text', imageData = null, metadata = null, processingTime = null) {
  if (!userInfo) {
    console.warn('Cannot save Q&A: user not authenticated');
    return false;
  }
  
  try {
    const data = {
      questionText,
      answerText,
      questionType,
      aiProvider: currentConfig.provider,
      aiModel: currentConfig.provider === 'ollama' ? currentConfig.ollama_model : currentConfig.gemini_model,
      imageData,
      metadata,
      processingTime
    };
    
    const result = await ipcRenderer.invoke('save-question-answer', data);
    
    if (result.success) {
      console.log('✅ Question and answer saved to database:', result);
      
      // Log the activity
      await logActivity('question_answer', 'saved', {
        questionId: result.questionId,
        answerId: result.answerId,
        questionType,
        aiProvider: data.aiProvider
      });
      
      return true;
    } else {
      console.error('❌ Failed to save Q&A to database:', result.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error saving Q&A to database:', error);
    return false;
  }
}

// Log activity to database
async function logActivity(featureName, action, details = null) {
  if (!userInfo) {
    console.warn('Cannot log activity: user not authenticated');
    return;
  }
  
  try {
    await ipcRenderer.invoke('log-activity', featureName, action, details);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Transfer data to Portal
async function transferDataToPortal() {
  if (!userInfo) {
    alert('Please sign in first to transfer your data.');
    return;
  }
  
  try {
    showLoading(true, 'Transferring data to Portal...');
    
    const result = await ipcRenderer.invoke('transfer-data-to-portal');
    
    showLoading(false);
    
    if (result.success) {
      alert(
        result.queued 
          ? 'Data queued for transfer when Portal becomes available.'
          : 'Data successfully transferred to Portal!'
      );
    } else {
      alert(`Failed to transfer data: ${result.error}`);
    }
  } catch (error) {
    showLoading(false);
    console.error('Data transfer error:', error);
    alert('Failed to transfer data. Please try again later.');
  }
}

// Export user data
async function exportUserData(format = 'json') {
  if (!userInfo) {
    alert('Please sign in first to export your data.');
    return;
  }
  
  try {
    showLoading(true, `Exporting data as ${format.toUpperCase()}...`);
    
    const result = await ipcRenderer.invoke('export-user-data', format);
    
    showLoading(false);
    
    if (result.success) {
      // Create download link
      const blob = new Blob([result.data], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert('Data exported successfully!');
    } else {
      alert(`Failed to export data: ${result.error}`);
    }
  } catch (error) {
    showLoading(false);
    console.error('Data export error:', error);
    alert('Failed to export data. Please try again later.');
  }
}

// Get user history
async function getUserHistory() {
  if (!userInfo) {
    console.warn('Cannot get history: user not authenticated');
    return [];
  }
  
  try {
    const result = await ipcRenderer.invoke('get-user-history', 50);
    
    if (result.success) {
      return result.history;
    } else {
      console.error('Failed to get user history:', result.error);
      return [];
    }
  } catch (error) {
    console.error('Error getting user history:', error);
    return [];
  }
}

// Handle user logout
function handleLogout() {
  console.log('🚪 User logout requested');
  
  // Clear auth data
  store.set('user_authenticated', false);
  store.delete('user_info');
  
  // Update UI
  userInfo = null;
  updateAuthUI(false);
  
  // Send message to main process
  ipcRenderer.send('user-logged-out');
}

// Show history modal
async function showHistoryModal() {
  const modal = document.getElementById('history-modal');
  const historyContent = document.getElementById('history-content');
  
  if (!modal || !historyContent) return;
  
  // Show modal
  modal.classList.remove('hidden');
  
  // Show loading
  historyContent.innerHTML = '<div class="loading-message">Loading history...</div>';
  
  try {
    const history = await getUserHistory();
    
    if (history.length === 0) {
      historyContent.innerHTML = `
        <div class="empty-history">
          <h4>No History Yet</h4>
          <p>Start asking questions and generating hints to see your history here!</p>
        </div>
      `;
      return;
    }
    
    // Group questions and answers
    const groupedHistory = {};
    history.forEach(item => {
      if (!groupedHistory[item.question_id]) {
        groupedHistory[item.question_id] = {
          question: item.question_text,
          questionType: item.question_type,
          questionDate: item.question_created_at,
          answers: []
        };
      }
      
      if (item.answer_text) {
        groupedHistory[item.question_id].answers.push({
          text: item.answer_text,
          provider: item.ai_provider,
          model: item.ai_model,
          date: item.answer_created_at
        });
      }
    });
    
    // Generate HTML
    let historyHtml = '';
    Object.values(groupedHistory).forEach(item => {
      const formattedDate = new Date(item.questionDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      historyHtml += `
        <div class="history-item">
          <div class="history-question">${escapeHtml(item.question)}</div>
          ${item.answers.map(answer => `
            <div class="history-answer">${escapeHtml(answer.text)}</div>
            <div class="history-meta">
              <span class="history-date">${formattedDate}</span>
              <span class="history-provider">${answer.provider || 'Unknown'}</span>
            </div>
          `).join('')}
        </div>
      `;
    });
    
    historyContent.innerHTML = historyHtml;
    
  } catch (error) {
    console.error('Failed to load history:', error);
    historyContent.innerHTML = `
      <div class="empty-history">
        <h4>Error Loading History</h4>
        <p>Unable to load your question history. Please try again later.</p>
      </div>
    `;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load app images with proper paths
function loadAppImages() {
  try {
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
    const basePath = isDev ? '../../assets/' : (process.resourcesPath + '/assets/');
    
    // Set logo image
    const appLogo = document.getElementById('app-logo');
    if (appLogo) {
      appLogo.src = path.join(basePath, 'logo_m.png');
    }
    
    // Set capture button icon
    const captureIcon = document.getElementById('capture-icon');
    if (captureIcon) {
      captureIcon.src = path.join(basePath, 'screenshot-64.png');
    }
    
    // Set settings button icon
    const settingsIcon = document.getElementById('settings-icon');
    if (settingsIcon) {
      settingsIcon.src = path.join(basePath, 'settings-94.png');
    }
  } catch (error) {
    console.error('Error loading app images:', error);
    // Fallback: try to load with relative paths
    const appLogo = document.getElementById('app-logo');
    if (appLogo) appLogo.src = '../../assets/logo_m.png';
    
    const captureIcon = document.getElementById('capture-icon');
    if (captureIcon) captureIcon.src = '../../assets/screenshot-64.png';
    
    const settingsIcon = document.getElementById('settings-icon');
  if (settingsIcon) settingsIcon.src = '../../assets/settings-94.png';
  }
}

// Check system readiness and show warnings if needed
async function checkSystemReadiness() {
  const config = loadConfig();
  
  // If onboarding wasn't completed, this shouldn't run the main app
  if (!config.onboarding_completed) {
    displayHints('⚠️ Please complete the initial setup first. Go to the app menu and select "Run Setup Again".');
    return;
  }
  
  // Check if AI provider is available
  await checkAIProviderStatus();
  
  // Check OCR availability
  await checkOCRStatus();
}

// Check AI Provider status
async function checkAIProviderStatus() {
  const config = loadConfig();
  
  if (config.provider === 'ollama') {
    try {
      await axios.get('http://localhost:11434/api/tags', { timeout: 3000 });
      updateStatus('Ready - Ollama connected');
    } catch (error) {
  console.warn('Ollama status check failed:', error && (error.message || error));
      updateStatus('Warning: Ollama not running');
      displayHints(`
        <div class="warning-message">
          <h3>⚠️ Ollama Not Running</h3>
          <p>Ollama is not currently running. To use SnapAssist AI:</p>
          <ul>
            <li>Open Ollama application, or</li>
            <li>Run <code>ollama serve</code> in terminal</li>
            <li>Or go to Settings and switch to Gemini</li>
          </ul>
        </div>
      `);
    }
  } else if (config.provider === 'gemini') {
    const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      updateStatus('Warning: Gemini API key not set');
      displayHints(`
        <div class="warning-message">
          <h3>⚠️ Gemini API Key Missing</h3>
          <p>Please configure your Gemini API key in Settings to use Google's AI.</p>
          <p>Get your free API key from <a href="#" onclick="require('electron').shell.openExternal('https://makersuite.google.com/app/apikey')">Google AI Studio</a></p>
        </div>
      `);
    } else {
      updateStatus('Ready - Gemini configured');
    }
  }
}

// Check OCR status
async function checkOCRStatus() {
  const tesseractAvailable = await checkTesseractAvailable();
  
  if (!tesseractAvailable) {
    console.warn('Tesseract OCR not available');
    // Don't show warning immediately, only when user tries to process an image
  }
}

// Update status text
function updateStatus(text) {
  const statusEl = document.getElementById('status-text');
  if (statusEl) {
    statusEl.textContent = text;
  }
}

// Update provider text
function updateProvider(provider, model) {
  const providerEl = document.getElementById('provider-text');
  if (providerEl) {
    providerEl.textContent = `Provider: ${provider} (${model})`;
  }
}

// Show/hide loading overlay
function showLoading(show = true, text = 'Processing...') {
  const overlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  
  if (overlay) {
    if (show) {
      overlay.classList.remove('hidden');
      if (loadingText) loadingText.textContent = text;
    } else {
      overlay.classList.add('hidden');
    }
  }
}

// Display hints in the UI
function displayHints(hintsText) {
  const hintsDisplay = document.getElementById('hints-display');
  if (!hintsDisplay) return;

  // Clear existing content
  hintsDisplay.innerHTML = '';
  
  if (!hintsText || hintsText.trim().startsWith('[') || hintsText.includes('Error')) {
    // Show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
      <h3>Error Processing Image</h3>
      <p>${hintsText || 'Failed to generate hints. Please try again.'}</p>
    `;
    hintsDisplay.appendChild(errorDiv);
    return;
  }

  const lines = hintsText.split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const hintMatch = trimmed.match(/^(Hint\s+\d+:)\s*(.*)$/i);
    
    if (hintMatch) {
      // This is a hint line
      const hintDiv = document.createElement('div');
      hintDiv.className = 'hint-item fade-in';
      
      const labelDiv = document.createElement('div');
      labelDiv.className = 'hint-label';
      labelDiv.textContent = hintMatch[1];
      
      const textDiv = document.createElement('div');
      textDiv.className = 'hint-text';
      textDiv.textContent = hintMatch[2];
      
      hintDiv.appendChild(labelDiv);
      hintDiv.appendChild(textDiv);
      hintsDisplay.appendChild(hintDiv);
    } else if (trimmed.toLowerCase().includes('now try') || 
               trimmed.toLowerCase().includes('work carefully') ||
               trimmed.toLowerCase().includes('complete')) {
      // This is encouragement text
      const encDiv = document.createElement('div');
      encDiv.className = 'encouragement fade-in';
      
      const encText = document.createElement('div');
      encText.className = 'encouragement-text';
      encText.textContent = trimmed;
      
      encDiv.appendChild(encText);
      hintsDisplay.appendChild(encDiv);
    } else {
      // Regular text
      const textDiv = document.createElement('div');
      textDiv.className = 'hint-text fade-in';
      textDiv.style.marginBottom = '12px';
      textDiv.textContent = trimmed;
      hintsDisplay.appendChild(textDiv);
    }
  });
}

// Classify question type (simplified version of Python logic)
function classifyQuestion(text) {
  const mcqPattern = /\([A-D]\)|\b\d\)\b/;
  if (mcqPattern.test(text)) {
    return 'MCQ';
  }
  if (text.includes('?') || /\b(solve|find|calculate|prove|evaluate)\b/i.test(text)) {
    return 'Descriptive';
  }
  return 'Not a Question';
}

// Detect difficulty
function detectDifficulty(text) {
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 15) return 'Easy';
  if (wordCount < 40) return 'Medium';
  return 'Hard';
}

// Build prompt for AI
function buildPrompt(text, qtype, difficulty) {
  return `You are SnapAssist AI, a study buddy for students.

The following text was extracted from a screenshot:
${text}

Classification:
- Type: ${qtype}
- Difficulty: ${difficulty}

Your role:
- Provide ONLY hints, NEVER the exact answer or final numeric/option.
- Do NOT solve the question fully.
- Do NOT mention which option is correct.
- Do NOT provide the final numeric value, simplified expression, or boxed result.
- Instead, give guiding clues that push the student to think.

Response format:
Always output between 3 to 5 hints in this style:
Hint 1: ...
Hint 2: ...
Hint 3: ...
(Hint 4 and Hint 5 only if needed)

Guidelines for hints:
- Focus on relevant formulae, rules, and methods.
- Use progressive layers: concept → formula → setup → approach → final nudge.
- Each hint should guide without completing the solution.
- Keep hints concise for faster responses.

End with an encouragement such as:
"Now try completing the final step on your own."
or
"Work carefully through the last step to see which option fits."

If the text is not a valid question, reply only:
⚠️ This does not appear to be a question.`;
}

// Query Ollama
async function queryOllama(prompt, model) {
  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: model,
      prompt: prompt,
      stream: false
    });
    
    return response.data.response || '[LLM Error] Empty response from Ollama';
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return '[Setup] Ollama not running. Please start Ollama first.';
    }
    return `[LLM Error] ${error.message}`;
  }
}

// Query Gemini
async function queryGemini(prompt, model, apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: prompt }]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey
      }
    });

    const candidates = response.data.candidates || [];
    if (!candidates.length) {
      return '[LLM Error] Empty response from Gemini';
    }

    const parts = candidates[0]?.content?.parts || [];
    const texts = parts.map(part => part.text).filter(Boolean);
    
    return texts.join('\n').trim() || '[LLM Error] Empty response from Gemini';
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 403) {
      // Fallback to gemini-1.5-flash
      if (model !== 'gemini-1.5-flash') {
        return queryGemini(prompt, 'gemini-1.5-flash', apiKey);
      }
    }
    return `[LLM Error] ${error.message}`;
  }
}

// Generate hints using AI
async function generateHints(text, qtype, difficulty, imageData = null, processingStartTime = null) {
  const prompt = buildPrompt(text, qtype, difficulty);
  const config = currentConfig;
  
  let hints;
  let processingTime = null;
  
  if (processingStartTime) {
    processingTime = Date.now() - processingStartTime;
  }
  
  if (config.provider === 'ollama') {
    hints = await queryOllama(prompt, config.ollama_model);
  } else if (config.provider === 'gemini') {
    const apiKey = store.get('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      hints = '[Setup] Gemini API key not set. Please configure in Settings.';
    } else {
      hints = await queryGemini(prompt, config.gemini_model, apiKey);
    }
  } else {
    hints = '[Setup] No valid AI provider configured.';
  }
  
  // Store current question data for potential saving
  currentQuestionData = {
    questionText: text,
    answerText: hints,
    questionType: qtype === 'text' ? 'text' : 'image_ocr',
    imageData: imageData,
    metadata: {
      difficulty: difficulty,
      question_type: qtype,
      timestamp: new Date().toISOString()
    },
    processingTime: processingTime
  };
  
  // Auto-save Q&A if user is authenticated and hints are valid
  if (userInfo && hints && !hints.startsWith('[') && !hints.includes('Error')) {
    setTimeout(async () => {
      await saveQuestionAnswer(
        currentQuestionData.questionText,
        currentQuestionData.answerText,
        currentQuestionData.questionType,
        currentQuestionData.imageData,
        currentQuestionData.metadata,
        currentQuestionData.processingTime
      );
    }, 100); // Small delay to ensure UI is updated first
  }
  
  return hints;
}

// Check if native Tesseract is available
function checkTesseractAvailable() {
  return new Promise((resolve) => {
    const tesseractProcess = spawn('tesseract', ['--version'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    tesseractProcess.on('close', (code) => {
      resolve(code === 0);
    });
    
    tesseractProcess.on('error', () => {
      resolve(false);
    });
  });
}

// Fallback OCR using Tesseract.js with proper configuration for Electron
async function extractTextWithTesseractJS(imageBuffer) {
  try {
    updateStatus('Extracting text using fallback OCR...');
    
    // Dynamic import to avoid initial loading issues
    const Tesseract = require('tesseract.js');
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--development');
    // Prefer local tessdata in production if available; otherwise allow default CDN
    const prodLangDir = path.join(process.resourcesPath, 'assets', 'tessdata');
    const langPath = (!isDev && fs.existsSync(path.join(prodLangDir, 'eng.traineddata'))) ? prodLangDir : undefined;

    // Configure Tesseract.js for Node.js/Electron environment
    const recognizeOptions = {
      logger: m => {
        if (m.status === 'recognizing text') {
          updateStatus(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    };
    if (langPath) recognizeOptions.langPath = langPath;

    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', recognizeOptions);
    
    return text.replace(/\s+/g, ' ').trim();
  } catch (error) {
    throw new Error(`Fallback OCR failed: ${error.message}`);
  }
}

// Extract text from image using native Tesseract with fallback
async function extractTextFromImage(imageBuffer) {
  try {
    updateStatus('Extracting text from image...');
    
    // First, try native Tesseract
    const tesseractAvailable = await checkTesseractAvailable();
    
    if (tesseractAvailable) {
      return await extractTextWithNativeTesseract(imageBuffer);
    } else {
  // Use bundled Tesseract.js fallback seamlessly
  updateStatus('Using built-in OCR (no system Tesseract)...');
  return await extractTextWithTesseractJS(imageBuffer);
    }
    
  } catch (error) {
    return `[OCR Error] ${error.message}`;
  }
}

// Native Tesseract extraction
async function extractTextWithNativeTesseract(imageBuffer) {
  // Create temporary file for the image
  const tempDir = os.tmpdir();
  const tempImagePath = path.join(tempDir, `hintify_temp_${Date.now()}.png`);
  
  // Write image buffer to temporary file
  fs.writeFileSync(tempImagePath, imageBuffer);
  
  return new Promise((resolve, reject) => {
    // Use native tesseract command
    const tesseractProcess = spawn('tesseract', [tempImagePath, 'stdout'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let outputText = '';
    let errorText = '';
    
    tesseractProcess.stdout.on('data', (data) => {
      outputText += data.toString();
    });
    
    tesseractProcess.stderr.on('data', (data) => {
      errorText += data.toString();
    });
    
    tesseractProcess.on('close', (code) => {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError.message);
      }
      
      if (code === 0) {
        const cleanText = outputText.replace(/\s+/g, ' ').trim();
        resolve(cleanText);
      } else {
        reject(new Error(`Tesseract failed: ${errorText || 'Unknown error'}`));
      }
    });
    
    tesseractProcess.on('error', (error) => {
      // Clean up temporary file
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError.message);
      }
      
      reject(error);
    });
  });
}

// Remove old fallback that required system install; Tesseract.js is used instead

// Get clipboard image
function getClipboardImage() {
  try {
    const image = clipboard.readImage();
    if (image.isEmpty()) {
      return null;
    }
    return image.toPNG();
  } catch (error) {
    console.error('Error reading clipboard:', error);
    return null;
  }
}

// Process clipboard image
async function processClipboardImage() {
  if (isProcessing) {
    updateStatus('Already processing...');
    return;
  }

  // Log clipboard usage
  await logActivity('clipboard', 'accessed');

  const imageBuffer = getClipboardImage();
  if (!imageBuffer) {
    updateStatus('No image found in clipboard');
    displayHints('⚠️ No image found in clipboard. Please copy an image first.');
    
    // Log clipboard failure
    await logActivity('clipboard', 'no_image_found');
    return;
  }
  
  // Log successful clipboard image retrieval
  await logActivity('clipboard', 'image_found', {
    image_size: imageBuffer.length
  });

  await processImage(imageBuffer);
}

// Process image (main processing function)
async function processImage(imageBuffer) {
  if (isProcessing) return;
  
  isProcessing = true;
  const processingStartTime = Date.now();
  showLoading(true, 'Processing image...');
  updateStatus('Processing image...');
  
  // Log activity start
  await logActivity('image_processing', 'started', {
    image_size: imageBuffer.length,
    timestamp: new Date().toISOString()
  });

  try {
    // Extract text from image
    const text = await extractTextFromImage(imageBuffer);
    
    if (!text || text.startsWith('[OCR Error]') || text.trim().length === 0) {
      const errorMsg = text?.startsWith('[OCR Error]') ? text : '⚠️ No text found in the image.';
      displayHints(errorMsg);
      
      // Log OCR failure
      await logActivity('ocr', 'failed', {
        error: errorMsg,
        processing_time_ms: Date.now() - processingStartTime
      });
      
      return;
    }
    
    // Log successful OCR
    await logActivity('ocr', 'completed', {
      text_length: text.length,
      processing_time_ms: Date.now() - processingStartTime
    });

    // Classify question
    const qtype = classifyQuestion(text);
    const difficulty = detectDifficulty(text);
    
    updateStatus(`Generating hints... (${qtype}, ${difficulty})`);
    showLoading(true, 'Generating hints...');

    // Generate hints with processing time tracking
    const hints = await generateHints(text, qtype, difficulty, imageBuffer.toString('base64'), processingStartTime);
    
    // Display results
    displayHints(hints);
    updateStatus('Ready');
    
    // Log successful completion
    await logActivity('image_processing', 'completed', {
      question_type: qtype,
      difficulty: difficulty,
      text_length: text.length,
      hints_length: hints.length,
      total_processing_time_ms: Date.now() - processingStartTime
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    displayHints(`[Error] ${error.message}`);
    updateStatus('Error occurred');
    
    // Log processing error
    await logActivity('image_processing', 'failed', {
      error: error.message,
      processing_time_ms: Date.now() - processingStartTime
    });
    
  } finally {
    isProcessing = false;
    showLoading(false);
  }
}

// Trigger screenshot capture
function triggerCapture() {
  updateStatus('Waiting for screenshot...');
  
  // On macOS, trigger screenshot to clipboard
  if (process.platform === 'darwin') {
    const { spawn } = require('child_process');
    const capture = spawn('screencapture', ['-i', '-c']);
    
    capture.on('close', (code) => {
      if (code === 0) {
        // Wait a moment then process clipboard
        setTimeout(() => {
          processClipboardImage();
        }, 1000);
      } else {
        updateStatus('Screenshot cancelled');
      }
    });
  } else if (process.platform === 'win32') {
    // On Windows, we could use PowerShell or other methods
    // For now, just show a message
    updateStatus('Please use Windows Snipping Tool and copy to clipboard');
    displayHints('📸 Please use Windows Snipping Tool (Win+Shift+S) to capture a screenshot, then press Ctrl+Shift+V to process it.');
  } else {
    // Linux and other platforms
    updateStatus('Please copy screenshot to clipboard');
    displayHints('📸 Please capture a screenshot and copy it to clipboard, then press Ctrl+Shift+V to process it.');
  }
}

// Initialize the app
function initializeApp() {
  console.log('🚀 Initializing Hintify SnapAssist AI...');
  
  // Load configuration
  const config = loadConfig();
  
  // Apply theme
  applyTheme(config.theme);
  
  // Load images with proper paths
  loadAppImages();
  
  // Check authentication status
  const isAuthenticated = checkAuthStatus();
  
  // Check if onboarding was completed
  if (!isAuthenticated) {
    // Show authentication message in main area
    displayAuthenticationMessage();
  } else {
    // Check system readiness for authenticated users
    checkSystemReadiness();
  }
  
  // Update provider display
  updateProvider(config.provider, config.provider === 'ollama' ? config.ollama_model : config.gemini_model);
  
  // Set up event listeners
  setupEventListeners();
  
  updateStatus('Ready');
}

// Set up all event listeners
function setupEventListeners() {
  const captureBtn = document.getElementById('capture-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const authBtn = document.getElementById('auth-btn');
  const userInfoDiv = document.getElementById('user-info');
  
  if (captureBtn) {
    captureBtn.addEventListener('click', triggerCapture);
  }
  
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      ipcRenderer.send('open-settings');
    });
  }
  
  if (authBtn) {
    authBtn.addEventListener('click', handleSignIn);
  }
  
  if (userInfoDiv) {
    userInfoDiv.addEventListener('click', handleLogout);
  }
  
  // User menu functionality
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdown = document.getElementById('user-dropdown');
  
  if (userMenuBtn && userDropdown) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
    });
    
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  // Data transfer button
  const transferDataBtn = document.getElementById('transfer-data-btn');
  if (transferDataBtn) {
    transferDataBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      transferDataToPortal();
    });
  }
  
  // Export buttons
  const exportJsonBtn = document.getElementById('export-json-btn');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      exportUserData('json');
    });
  }
  
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      exportUserData('csv');
    });
  }
  
  // View history button
  const viewHistoryBtn = document.getElementById('view-history-btn');
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      showHistoryModal();
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      userDropdown.classList.add('hidden');
      handleLogout();
    });
  }
  
  // History modal functionality
  const historyModal = document.getElementById('history-modal');
  const closeHistoryModal = document.getElementById('close-history-modal');
  
  if (closeHistoryModal) {
    closeHistoryModal.addEventListener('click', () => {
      historyModal.classList.add('hidden');
    });
  }
  
  if (historyModal) {
    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) {
        historyModal.classList.add('hidden');
      }
    });
  }

  // Set up IPC listeners
  ipcRenderer.on('trigger-capture', triggerCapture);
  ipcRenderer.on('process-clipboard', processClipboardImage);
  
  ipcRenderer.on('config-updated', (event, newConfig) => {
    currentConfig = { ...currentConfig, ...newConfig };
    applyTheme(newConfig.theme);
    updateProvider(newConfig.provider, newConfig.provider === 'ollama' ? newConfig.ollama_model : newConfig.gemini_model);
  });
  
// Listen for authentication updates
  ipcRenderer.on('auth-status-updated', (event, authData) => {
    console.log('🔄 Auth status updated:', authData);
    
    if (authData.authenticated && authData.user) {
      console.log('✅ User authenticated, updating UI immediately');
      
      // Update local state
      userInfo = authData.user;
      store.set('user_authenticated', true);
      store.set('user_info', authData.user);
      
      // Update UI immediately
      updateAuthUI(true, authData.user);
      
      // Clear any authentication messages and show system readiness
      checkSystemReadiness();
      
      updateStatus('Authentication successful! Ready to process images.');
      
      console.log('🎨 UI updated for authenticated user:', {
        displayName: authData.user.name || authData.user.firstName || authData.user.email,
        email: authData.user.email,
        hasImage: !!(authData.user.imageUrl || authData.user.avatar)
      });
      
    } else {
      console.log('🚪 User logged out, updating UI');
      
      // User logged out
      userInfo = null;
      store.set('user_authenticated', false);
      store.delete('user_info');
      
      updateAuthUI(false);
      displayAuthenticationMessage();
      
      updateStatus('Please sign in to continue');
    }
  });
  
  // Listen for deep link events (additional handler for direct deep link processing)
  ipcRenderer.on('deep-link-received', (event, data) => {
    console.log('🔗 Deep link received in renderer:', data);
    
    if (data.action === 'auth-success' && data.user) {
      console.log('🎉 Processing deep link authentication success');
      
      // Update local state immediately
      userInfo = data.user;
      store.set('user_authenticated', true);
      store.set('user_info', data.user);
      
      // Update UI
      updateAuthUI(true, data.user);
      checkSystemReadiness();
      
      updateStatus('Welcome back! Authentication successful.');
      
      // Show success message temporarily
      displayHints(`✅ <strong>Welcome back, ${data.user.name || data.user.firstName || 'User'}!</strong><br><br>You're now signed in and ready to use Hintify SnapAssist AI. You can start capturing screenshots or processing clipboard images.`);
    }
  });
  
  // Listen for sign-in request from menu
  ipcRenderer.on('show-sign-in', () => {
    console.log('🔐 Sign-in requested from menu');
    handleSignIn();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
      e.preventDefault();
      processClipboardImage();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      triggerCapture();
    }
  });
}

// Display authentication message in main area
function displayAuthenticationMessage() {
  const hintsDisplay = document.getElementById('hints-display');
  if (!hintsDisplay) return;

  hintsDisplay.innerHTML = `
    <div class="welcome-message">
      <h2>🔐 Authentication Required</h2>
      <p>Please sign in to use Hintify SnapAssist AI and track your learning progress.</p>
      <div class="instructions">
        <h3>Sign In Benefits:</h3>
        <ul>
          <li>🧠 Track your thinking progress and improvement</li>
          <li>📊 Access your personalized dashboard</li>
          <li>🎯 Get hints tailored to your skill level</li>
          <li>🚀 Sync your preferences across devices</li>
        </ul>
        <div class="setup-reminder">
          <p><strong>Ready to start?</strong> Click the <strong>"Sign In"</strong> button in the top-right corner to authenticate with your Hintify account.</p>
        </div>
      </div>
    </div>
  `;
}

// Start clipboard monitoring (simplified)
function startClipboardMonitor() {
  let lastImageHash = null;
  
  setInterval(() => {
    if (isProcessing) return;
    
    const imageBuffer = getClipboardImage();
    if (imageBuffer) {
      const crypto = require('crypto');
      const currentHash = crypto.createHash('md5').update(imageBuffer).digest('hex');
      
      if (currentHash !== lastImageHash) {
        lastImageHash = currentHash;
        // Auto-process new clipboard images (optional behavior)
        // processImage(imageBuffer);
      }
    }
  }, 2000); // Check every 2 seconds
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  // Uncomment to enable auto clipboard monitoring
  // startClipboardMonitor();
});

// Handle app focus
window.addEventListener('focus', () => {
  updateStatus('Ready');
});

// Export functions for potential use
module.exports = {
  processClipboardImage,
  triggerCapture,
  loadConfig,
  saveConfig,
  applyTheme
};
