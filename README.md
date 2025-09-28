# Hintify - Electron Version

This is the Electron desktop application version of Hintify, a real-time clipboard-to-hints assistant that helps students with their studies by providing AI-generated hints for questions captured in screenshots.

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

#### Ollama (Recommended - Local AI)
1. Install Ollama from [ollama.com](https://ollama.com/download)
2. Start Ollama service
3. Pull the required model:
   ```bash
   ollama pull granite3.2-vision:2b
   ```
4. In app settings, select "Ollama" as provider

#### Gemini (Cloud AI)
1. Get API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. In app settings, select "Gemini" as provider
3. Enter your API key in the settings

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
