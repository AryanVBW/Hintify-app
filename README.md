# Hintify - AI-Powered Study Assistant

<div align="center">

[![Website](https://img.shields.io/badge/Website-hintify.nexus--v.tech-blue?style=for-the-badge)](https://hintify.nexus-v.tech/)
[![GitHub Release](https://img.shields.io/github/v/release/AryanVBW/Hintify-app?style=for-the-badge)](https://github.com/AryanVBW/Hintify-app/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=for-the-badge)](https://github.com/AryanVBW/Hintify-app)

**🌐 Visit our website:** [hintify.nexus-v.tech](https://hintify.nexus-v.tech/)

</div>

---

This is the Electron desktop application version of Hintify, a real-time clipboard-to-hints assistant that helps students with their studies by providing AI-generated hints for questions captured in screenshots.

## 🚀 Quick Install (macOS)

Install Hintify with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/AryanVBW/Hintify-app/refs/heads/main/install.sh | bash
```

This script will:
- ✅ Install Homebrew (if not already installed)
- ✅ Download the latest version of Hintify
- ✅ Install it to your Applications folder
- ✅ Code sign the application
- ✅ Launch Hintify automatically

**Manual Installation:** Download the latest `.dmg` file from [Releases](https://github.com/AryanVBW/Hintify-app/releases/latest)

---

## Features

### 🎯 Core Functionality
- **Screenshot Capture**: Integrated screenshot capture with system tools
- **OCR Text Extraction**: Uses Tesseract.js to extract text from images
- **AI-Powered Hints**: Generates study hints using Ollama (local) or Gemini (cloud)
- **Question Classification**: Automatically detects question type (MCQ, Descriptive) and difficulty
- **Smart Hint Generation**: Provides progressive hints without revealing final answers

### 🎨 User Interface
- **Modern Design**: Clean, native-looking interface matching the original Python app
- **Multiple Themes**: Dark, Light, and Glass themes
- **Responsive Layout**: Adapts to different window sizes
- **Smooth Animations**: Polished user experience with transitions

### ⚙️ Advanced Features
- **Global Hotkeys**: Capture screenshots from anywhere (Cmd+Shift+H on Mac, Ctrl+Shift+H on Windows)
- **Persistent Settings**: Configuration saved automatically
- **Provider Switching**: Easy switching between Ollama and Gemini
- **Connection Testing**: Built-in connection testing for AI providers

## Installation & Setup

### Prerequisites
1. **Node.js** (version 16 or higher)
2. **Ollama** (if using local AI) - Install from [ollama.com](https://ollama.com/download)
3. **Gemini API Key** (if using cloud AI) - Get from [Google AI Studio](https://aistudio.google.com/apikey)

### Installation Steps
1. Navigate to the Hintify_app directory:
   ```bash
   cd /path/to/Hintify/Hintify_app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

### Building for Distribution
```bash
# Build for current platform
npm run build

# Build for macOS
npm run build-mac

# Build for Windows
npm run build-win

# Build for Linux
npm run build-linux
```

## Configuration

### AI Provider Setup

#### Gemini (Recommended - Cloud AI)
1. Get your free API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. Open Hintify Settings
3. Enter your API key in the Gemini API Key field
4. Select your preferred model (gemini-2.0-flash recommended)
5. Click "Test Connection" to verify
6. Save settings

#### Ollama (Alternative - Local AI)
1. Install Ollama from [ollama.com](https://ollama.com/download)
2. Start Ollama service
3. Pull the required model:
   ```bash
   ollama pull granite3.2-vision:2b
   ```
4. In app settings, select "Ollama" as provider



## Usage

### Basic Usage
1. **Capture Screenshot**: Click the 📸 button or use global hotkey (Cmd+Shift+H)
2. **Process Clipboard**: Copy an image and press Cmd/Ctrl+Shift+V
3. **View Hints**: AI-generated hints will appear in the main window

### Keyboard Shortcuts
- `Cmd+Shift+H` (Mac) / `Ctrl+Shift+H` (Windows): Global screenshot capture
- `Cmd+Shift+S` / `Ctrl+Shift+S`: Screenshot selection
- `Cmd+Shift+V` / `Ctrl+Shift+V`: Process clipboard image
- `Cmd+,` / `Ctrl+,`: Open settings

### Menu Options
- **File Menu**: Access settings and quit
- **Capture Menu**: Screenshot tools
- **View Menu**: Window controls and developer tools
- **Help Menu**: Documentation and support links

## Settings & Customization

### AI Provider Settings
- **Provider**: Choose between Ollama (local) or Gemini (cloud)
- **Ollama Model**: Specify which local model to use
- **Gemini Model**: Select Gemini model variant
- **API Key**: Secure storage of Gemini API key

### Appearance
- **Theme**: Dark, Light, or Glass themes
- **Auto Theme**: Follows system preferences
- **Window Size**: Remembers window position and size

### Testing Connection
Use the "Test Connection" button in settings to verify your AI provider is working correctly.

## Troubleshooting

### Common Issues

#### "Ollama not running"
- Ensure Ollama is installed and running
- Start Ollama: `ollama serve`
- Check if model is available: `ollama list`

#### "Model not found"
- Pull the required model: `ollama pull granite3.2-vision:2b`
- Check available models: `ollama list`

#### "Gemini API error"
- Verify API key is correct
- Check your Google AI Studio quota
- Ensure network connectivity

#### OCR not working
- The app uses Tesseract.js which downloads worker files on first use
- Ensure stable internet connection for initial setup
- Clear browser cache if needed

#### Global hotkeys not working
- On macOS: Grant accessibility permissions to the app
- On Windows: Run as administrator if needed
- Check if hotkey conflicts with other apps

## Development

### Project Structure
```
Hintify_app/
├── src/
│   ├── main.js                 # Main Electron process
│   └── renderer/
│       ├── index.html          # Main UI
│       ├── styles.css          # Main styles
│       ├── renderer.js         # Main renderer logic
│       ├── settings.html       # Settings UI
│       ├── settings.css        # Settings styles
│       └── settings.js         # Settings logic
├── assets/                     # Icons and images
├── package.json               # Dependencies and scripts
└── README.md                  # This file
```

## Accessibility Improvements (WCAG 2.1)

This release adds accessibility improvements to make Hintify usable by all students, including those with disabilities.

Key features added:
- Screen reader support: ARIA roles and labels on interactive elements and dynamic hint content.
- Keyboard navigation: Tab/Shift+Tab, ArrowUp/ArrowDown to navigate hints, Enter/Space to activate actions.
- Text-to-Speech (TTS): Toggle TTS in the status bar ("TTS" button). Hints can be read aloud.
- Color contrast: Theme variables adjusted for stronger contrast; added high-contrast mode toggle.
- Font size adjustment: A+/A- buttons in the status bar to increase/decrease font size.
- Focus indicators: Strong visible focus outlines for keyboard users.

How to use the accessibility controls:
- Toggle TTS: Click the "TTS" button in the top-right status area.
- Increase font size: Click "A+". Decrease with "A-".
- Toggle high contrast: Click "Contrast".

Automated & manual testing recommendations:
- Lighthouse (Chrome/Edge): Run Lighthouse Accessibility audit and target 90+.
- axe DevTools: Run axe to find any remaining ARIA or color contrast issues.
- NVDA (Windows) / VoiceOver (macOS): Test screen reader flows for hints, buttons, and dialogs.
- Keyboard-only: Use Tab/Shift+Tab, Arrow keys, Enter, and Space to navigate and activate features.

If you find an accessibility issue, please open an issue with steps to reproduce and attach a short recording or notes from the assistive technology.


### Key Features Implemented

#### ✅ Exact Feature Parity with Python Version
- **Clipboard Monitoring**: Real-time image detection
- **OCR Integration**: Text extraction from screenshots
- **AI Integration**: Both Ollama and Gemini support
- **Question Classification**: MCQ vs Descriptive detection
- **Hint Generation**: Progressive hint system
- **Settings Management**: Persistent configuration
- **Theme System**: Multiple visual themes
- **Global Hotkeys**: System-wide shortcuts

#### ✅ Enhanced Electron Features
- **Native Integration**: Uses Electron APIs for better OS integration
- **Modern UI**: Responsive, animated interface
- **Menu Bar**: Full application menu
- **Window Management**: Remembers size and position
- **IPC Communication**: Secure inter-process messaging
- **Auto-updater Ready**: Built with electron-builder

### Development Commands
```bash
# Start in development mode
npm run dev

# Package without building installer
npm run pack

# Build with debug info
npm start -- --development
```

## Comparison with Python Version

### Advantages of Electron Version
1. **Better OS Integration**: Native window management, menus, notifications
2. **Modern UI**: More polished, responsive interface with animations
3. **Cross-Platform**: Single codebase for all platforms
4. **Web Technologies**: Easier to maintain and extend
5. **Auto-Updates**: Built-in update mechanisms
6. **Better Performance**: Optimized rendering and memory management

### Feature Parity
- ✅ All core functionality preserved
- ✅ Same AI providers (Ollama + Gemini)
- ✅ Identical hint generation logic
- ✅ Same theme system
- ✅ Global hotkeys support
- ✅ Settings persistence
- ✅ OCR capabilities

## Contributing

This Electron version maintains full compatibility with the original Python application while providing a more native desktop experience. All core algorithms and AI integration remain identical to ensure consistent behavior.

## License

MIT License - Same as the original Hintify project.

## Support

For issues specific to the Electron version, please create an issue in the main Hintify repository with the "electron" label.
