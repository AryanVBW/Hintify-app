#!/bin/bash

#############################################################################
#                                                                           #
#  ██╗  ██╗██╗███╗   ██╗████████╗██╗███████╗██╗   ██╗                    #
#  ██║  ██║██║████╗  ██║╚══██╔══╝██║██╔════╝╚██╗ ██╔╝                    #
#  ███████║██║██╔██╗ ██║   ██║   ██║█████╗   ╚████╔╝                     #
#  ██╔══██║██║██║╚██╗██║   ██║   ██║██╔══╝    ╚██╔╝                      #
#  ██║  ██║██║██║ ╚████║   ██║   ██║██║        ██║                       #
#  ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝        ╚═╝                       #
#                                                                           #
#  Automated Electron App Installer for macOS                              #
#  Version: 1.0.0                                                          #
#  Created for: https://hintify.nexus-v.tech/                             #
#                                                                           #
#############################################################################

# Configuration - Modify these values for your specific app
GITHUB_REPO_OWNER="AryanVBW"
GITHUB_REPO_NAME="Hintify-app"
APP_NAME="Hintify"
APP_DISPLAY_NAME="Hintify - Your Smart Assistant"
WEBSITE_URL="https://hintify.nexus-v.tech/"

# These will be populated by fetching latest release
GITHUB_REPO_URL=""
LATEST_VERSION=""
RELEASE_NOTES=""

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BOLD='\033[1m'
RESET='\033[0m'
PURPLE='\033[0;35m'
ORANGE='\033[38;5;208m'

# ASCII Art symbols and animations
SUCCESS="[✓]"
ERROR="[✗]"
INFO="[i]"
DOWNLOAD="[↓]"
INSTALL="[+]"
ROCKET="[>>]"
MAGIC="[*]"
CHECK="[√]"

# Script variables
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEMP_DIR=$(mktemp -d)
ZIP_FILE="$TEMP_DIR/${APP_NAME}.zip"
EXTRACT_DIR="$TEMP_DIR/extracted"
IS_INTERACTIVE=true
# Fancy UI (animations beyond simple spinner/progress). Set to true to enable.
FANCY_UI=${FANCY_UI:-false}

# Check if terminal is interactive
if [ ! -t 1 ]; then
    IS_INTERACTIVE=false
fi

# Cleanup function
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR" 2>/dev/null
    fi
    # Always show cursor again
    if [ "$IS_INTERACTIVE" = true ]; then
        printf '\033[?25h' 2>/dev/null || true
    fi
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

# Print colored message
print_message() {
    local color=$1
    local message=$2
    local symbol=$3
    
    if [ "$IS_INTERACTIVE" = true ]; then
        echo -e "${color}${symbol} ${message}${RESET}"
    else
        echo "$message"
    fi
}

# Print header
print_header() {
    if [ "$IS_INTERACTIVE" = true ]; then
        # Clear screen and move cursor to top
        printf "\r\033[2K\033[2J\033[H"

        echo -e "\033[96m╔═══════════════════════════════════════════════════════════════════════════╗\033[0m"
        echo -e "\033[96m║                                                                           ║\033[0m"
        echo -e "\033[96m║            ██╗  ██╗██╗███╗   ██╗████████╗██╗███████╗██╗   ██╗             ║\033[0m"
        echo -e "\033[96m║            ██║  ██║██║████╗  ██║╚══██╔══╝██║██╔════╝╚██╗ ██╔╝             ║\033[0m"
        echo -e "\033[96m║            ███████║██║██╔██╗ ██║   ██║   ██║█████╗   ╚████╔╝              ║\033[0m"
        echo -e "\033[96m║            ██╔══██║██║██║╚██╗██║   ██║   ██║██╔══╝    ╚██╔╝               ║\033[0m"
        echo -e "\033[96m║            ██║  ██║██║██║ ╚████║   ██║   ██║██║        ██║                ║\033[0m"
        echo -e "\033[96m║            ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝╚═╝        ╚═╝                ║\033[0m"
        echo -e "\033[96m║                                                                           ║\033[0m"
        echo -e "\033[93m║                         SnapAssist AI - Smart Assistant                   ║\033[0m"
        echo -e "\033[95m║                             hintify.nexus-v.tech                          ║\033[0m"

        # Display version if available
        if [ -n "$LATEST_VERSION" ]; then
            echo -e "\033[96m║                                                                           ║\033[0m"
            echo -e "\033[92m║                           Version: ${LATEST_VERSION}                                  ║\033[0m"
        fi

        echo -e "\033[96m║                                                                           ║\033[0m"
        echo -e "\033[92m║                               >> Founders <<                              ║\033[0m"
        echo -e "\033[94m║                                Rishabh Bafna                              ║\033[0m"
        echo -e "\033[94m║                LinkedIn: linkedin.com/in/rishabh-bafna-98402212a          ║\033[0m"
        echo -e "\033[94m║                           github.com/RishabhIIITD                         ║\033[0m"
        echo -e "\033[91m║                                                                           ║\033[0m"
        echo -e "\033[91m║                                    Vivek W                                ║\033[0m"
        echo -e "\033[91m║                    LinkedIn: linkedin.com/in/vivek-wagadare               ║\033[0m"
        echo -e "\033[91m║                             github.com/AryanVBW                           ║\033[0m"
        echo -e "\033[96m╠═══════════════════════════════════════════════════════════════════════════╣\033[0m"
        echo -e "\033[93m║                             Welcome to Hintify!                           ║\033[0m"
        echo -e "\033[96m╚═══════════════════════════════════════════════════════════════════════════╝\033[0m"
        echo -e "\033[0m"
    fi
}


# Animated spinner (single-line, non-overlapping)
spinner() {
    local pid=$1; shift
    local message=${*:-"Working..."}
    local delay=0.1
    local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")

    if [ "$IS_INTERACTIVE" = true ]; then
        # Hide cursor
        printf '\033[?25l' 2>/dev/null || true
        local i=0
        while kill -0 "$pid" 2>/dev/null; do
            local frame=${frames[$((i % ${#frames[@]}))]}
            # Clear line and print
            printf "\r\033[2K${CYAN}%s${RESET} %s" "$frame" "$message"
            i=$((i + 1))
            sleep "$delay"
        done
        # Clear line and restore cursor
        printf "\r\033[2K" 2>/dev/null
        printf '\033[?25h' 2>/dev/null || true
    else
        wait "$pid"
    fi
}

# Progress bar
progress_bar() {
    local current=$1
    local total=$2
    local width=50
    
    if [ "$IS_INTERACTIVE" = false ]; then
        return
    fi
    
    local progress=$((current * width / total))
    local percentage=$((current * 100 / total))
    # Clear line, draw, stay on the same line
    printf "\r\033[2K${CYAN}Progress: ["
    printf "%${progress}s" | tr ' ' '█'
    printf "%$((width - progress))s" | tr ' ' '░'
    printf "] ${BOLD}%3d%%${RESET}" "$percentage"
    
    if [ $current -eq $total ]; then
        printf "\n"
    fi
}

# ASCII Art animation with wave effect
wave_animation() {
    if [ "$IS_INTERACTIVE" = false ] || [ "$FANCY_UI" != true ]; then
        return
    fi
    local duration=${1:-1}
    local end=$(( $(date +%s) + duration ))
    local waves=("~~~" "^^^" "---" "===")
    local i=0
    
    printf "\n${BOLD}${CYAN}Initializing Hintify Magic...${RESET}\n"
    while [ $(date +%s) -lt $end ]; do
        local wave=${waves[$((i % ${#waves[@]}))]}
        printf "\r${YELLOW}${wave} Loading ${wave}${RESET}"
        i=$((i + 1))
        sleep 0.1
    done
    printf "\r\033[2K\n"
}

# Typewriter effect for text
typewriter_effect() {
    local text="$1"
    local color="${2:-$WHITE}"
    local delay="${3:-0.05}"
    
    if [ "$IS_INTERACTIVE" = false ]; then
        printf "%b%s%b\n" "$color" "$text" "$RESET"
        return
    fi
    
    for ((i=0; i<${#text}; i++)); do
        printf "%b%c%b" "$color" "${text:$i:1}" "$RESET"
        sleep "$delay"
    done
    printf "\n"
}

# Progress dots animation
progress_dots() {
    if [ "$IS_INTERACTIVE" = false ]; then
        return
    fi
    
    local message="${1:-Working}"
    local duration="${2:-2}"
    local end=$(( $(date +%s) + duration ))
    
    printf "%s" "$message"
    while [ $(date +%s) -lt $end ]; do
        for dots in "." ".." "..." ""; do
            printf "\r%s%s   " "$message" "$dots"
            sleep 0.3
        done
    done
    printf "\r\033[2K%s... Done!\n" "$message"
}

# Step indicator with ASCII art animation
step_indicator() {
    local step_num=$1
    local total_steps=$2
    local step_name=$3
    
    if [ "$IS_INTERACTIVE" = true ]; then
        echo -e "\n${CYAN}╔═══════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}║${RESET} ${BOLD}>>> Step ${step_num}/${total_steps}:${RESET} ${step_name}"
        echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${RESET}"
        
        # Add a brief loading animation
        if [ "$FANCY_UI" = true ]; then
            progress_dots "  Preparing" 1
        fi
    else
        echo "Step ${step_num}/${total_steps}: ${step_name}"
    fi
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Homebrew
install_homebrew() {
    step_indicator 1 7 "Checking Homebrew Installation"
    
    if command_exists brew; then
        print_message "$GREEN" "Homebrew is already installed" "$CHECK"
        return 0
    fi
    
    print_message "$YELLOW" "Homebrew not found. Installing..." "$INFO"
    wave_animation 1
    
    # Install Homebrew silently
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null &
    spinner $! "Installing Homebrew"
    
    # Add Homebrew to PATH for Apple Silicon Macs
    if [ -f "/opt/homebrew/bin/brew" ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    
    if command_exists brew; then
        print_message "$GREEN" "Homebrew installed successfully" "$SUCCESS"
    else
        print_message "$RED" "Failed to install Homebrew" "$ERROR"
        exit 1
    fi
}

# Fetch latest release information from GitHub
fetch_latest_release() {
    step_indicator 2 8 "Fetching Latest Release Information"

    print_message "$CYAN" "Checking GitHub for latest version..." "$INFO"

    # Fetch latest release info from GitHub API
    local api_url="https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest"
    local release_info=""

    if command_exists curl; then
        release_info=$(curl -sL "$api_url" 2>/dev/null)
    elif command_exists wget; then
        release_info=$(wget -qO- "$api_url" 2>/dev/null)
    else
        print_message "$RED" "Neither curl nor wget found. Cannot fetch release info." "$ERROR"
        exit 1
    fi

    # Extract version tag (e.g., "v1.0.9")
    LATEST_VERSION=$(echo "$release_info" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/"tag_name": *"\(.*\)"/\1/')

    # Extract download URL for macOS ARM64 ZIP
    GITHUB_REPO_URL=$(echo "$release_info" | grep -o '"browser_download_url": *"[^"]*arm64[^"]*\.zip"' | head -1 | sed 's/"browser_download_url": *"\(.*\)"/\1/')

    # Extract release notes
    RELEASE_NOTES=$(echo "$release_info" | grep -o '"body": *"[^"]*"' | head -1 | sed 's/"body": *"\(.*\)"/\1/' | sed 's/\\n/\n/g' | head -5)

    if [ -z "$LATEST_VERSION" ] || [ -z "$GITHUB_REPO_URL" ]; then
        print_message "$RED" "Failed to fetch latest release information" "$ERROR"
        print_message "$YELLOW" "Please check your internet connection or try again later" "$INFO"
        exit 1
    fi

    print_message "$GREEN" "Latest version: $LATEST_VERSION" "$SUCCESS"
    print_message "$CYAN" "Download URL: $GITHUB_REPO_URL" "$INFO"

    # Display release notes if available
    if [ -n "$RELEASE_NOTES" ]; then
        print_message "$YELLOW" "Release Notes:" "$INFO"
        echo "$RELEASE_NOTES" | head -3
    fi
}

# Install wget
install_wget() {
    step_indicator 3 8 "Checking wget Installation"

    if command_exists wget; then
        print_message "$GREEN" "wget is already installed" "$CHECK"
        return 0
    fi

    print_message "$YELLOW" "Installing wget via Homebrew..." "$INFO"

    brew install wget >/dev/null 2>&1 &
    spinner $! "Installing wget"

    if command_exists wget; then
        print_message "$GREEN" "wget installed successfully" "$SUCCESS"
    else
        print_message "$RED" "Failed to install wget" "$ERROR"
        exit 1
    fi
}

# Download app with progress and retry logic
download_app() {
    step_indicator 4 8 "Downloading ${APP_DISPLAY_NAME} ${LATEST_VERSION}"
    
    print_message "$CYAN" "Downloading from GitHub..." "$DOWNLOAD"
    
    # Ensure we start on a clean line
    printf "\r\033[2K" 2>/dev/null

    local max_attempts=3
    local attempt=1
    local download_success=false
    
    while [ $attempt -le $max_attempts ] && [ "$download_success" = false ]; do
        if [ $attempt -gt 1 ]; then
            print_message "$YELLOW" "Retrying download (attempt $attempt/$max_attempts)..." "$INFO"
            sleep 2
        fi
        
        if command -v curl >/dev/null 2>&1; then
            if [ "$IS_INTERACTIVE" = true ]; then
                # Use curl with retry, resume capability, and connection timeout
                if curl -L --fail --progress-bar \
                    --retry 2 --retry-delay 1 --retry-max-time 30 \
                    --connect-timeout 10 --max-time 300 \
                    --user-agent "Hintify-Installer/1.0" \
                    -C - -o "$ZIP_FILE" "$GITHUB_REPO_URL"; then
                    download_success=true
                fi
                printf "\n"
            else
                if curl -L --fail -sS \
                    --retry 2 --retry-delay 1 --retry-max-time 30 \
                    --connect-timeout 10 --max-time 300 \
                    --user-agent "Hintify-Installer/1.0" \
                    -C - -o "$ZIP_FILE" "$GITHUB_REPO_URL"; then
                    download_success=true
                fi
            fi
        else
            # Fallback to wget with retry logic
            if [ "$IS_INTERACTIVE" = true ]; then
                if wget --show-progress --progress=bar:force:noscroll \
                    --tries=2 --timeout=10 --read-timeout=30 \
                    --user-agent="Hintify-Installer/1.0" \
                    -c "$GITHUB_REPO_URL" -O "$ZIP_FILE"; then
                    download_success=true
                fi
                printf "\n"
            else
                if wget -q --tries=2 --timeout=10 --read-timeout=30 \
                    --user-agent="Hintify-Installer/1.0" \
                    -c "$GITHUB_REPO_URL" -O "$ZIP_FILE"; then
                    download_success=true
                fi
            fi
        fi
        
        # Check if download was successful and file exists with reasonable size
        if [ "$download_success" = true ] && [ -f "$ZIP_FILE" ]; then
            local file_size=$(stat -f%z "$ZIP_FILE" 2>/dev/null || wc -c < "$ZIP_FILE")
            if [ "$file_size" -gt 1000 ]; then  # At least 1KB
                print_message "$GREEN" "Download completed successfully ($file_size bytes)" "$SUCCESS"
                return 0
            else
                print_message "$YELLOW" "Downloaded file seems too small, retrying..." "$INFO"
                rm -f "$ZIP_FILE" 2>/dev/null
                download_success=false
            fi
        fi
        
        attempt=$((attempt + 1))
    done
    
    # If all attempts failed, try alternative methods
    if [ "$download_success" = false ]; then
        print_message "$YELLOW" "Direct download failed. Trying alternative method..." "$INFO"
        
        # Try with different curl options (disable HTTP/2, use HTTP/1.1)
        if command -v curl >/dev/null 2>&1; then
            if curl -L --fail --http1.1 --progress-bar \
                --connect-timeout 15 --max-time 600 \
                --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" \
                -o "$ZIP_FILE" "$GITHUB_REPO_URL"; then
                download_success=true
                printf "\n"
            fi
        fi
    fi
    
    # Final check
    if [ "$download_success" = true ] && [ -f "$ZIP_FILE" ]; then
        local file_size=$(stat -f%z "$ZIP_FILE" 2>/dev/null || wc -c < "$ZIP_FILE")
        print_message "$GREEN" "Download completed successfully ($file_size bytes)" "$SUCCESS"
    else
        print_message "$RED" "Failed to download the app after $max_attempts attempts" "$ERROR"
        print_message "$YELLOW" "Please check your internet connection or try again later" "$INFO"
        print_message "$CYAN" "Alternative: Download manually from: $GITHUB_REPO_URL" "$INFO"
        exit 1
    fi
}

# Extract ZIP
extract_app() {
    step_indicator 5 8 "Extracting Application"
    
    print_message "$CYAN" "Extracting ${APP_NAME}.zip..." "$INSTALL"
    
    mkdir -p "$EXTRACT_DIR"
    unzip -q "$ZIP_FILE" -d "$EXTRACT_DIR" &
    spinner $! "Extracting archive"
    
    # Find the .app bundle
    APP_PATH=$(find "$EXTRACT_DIR" -name "*.app" -type d | head -n 1)
    
    if [ -n "$APP_PATH" ]; then
        APP_BASENAME=$(basename "$APP_PATH")
        print_message "$GREEN" "Found application: $APP_BASENAME" "$SUCCESS"
    else
        print_message "$RED" "No .app bundle found in the ZIP" "$ERROR"
        exit 1
    fi
}

# Move to Applications
move_to_applications() {
    step_indicator 6 8 "Installing to Applications Folder"
    
    local target_dir="$HOME/Applications"
    local needs_sudo=false
    
    # Create ~/Applications if it doesn't exist
    if [ ! -d "$target_dir" ]; then
        mkdir -p "$target_dir" 2>/dev/null
        if [ ! -d "$target_dir" ]; then
            target_dir="/Applications"
            needs_sudo=true
        fi
    fi
    
    print_message "$CYAN" "Moving to $target_dir..." "$INFO"
    
    # Remove existing app if present
    if [ -d "$target_dir/$APP_BASENAME" ]; then
        if [ "$needs_sudo" = true ]; then
            sudo rm -rf "$target_dir/$APP_BASENAME" 2>/dev/null
        else
            rm -rf "$target_dir/$APP_BASENAME" 2>/dev/null
        fi
    fi
    
    # Move the app
    if [ "$needs_sudo" = true ]; then
        sudo mv "$APP_PATH" "$target_dir/" &
        spinner $! "Moving application"
    else
        mv "$APP_PATH" "$target_dir/" &
        spinner $! "Moving application"
    fi
    
    FINAL_APP_PATH="$target_dir/$APP_BASENAME"
    
    if [ -d "$FINAL_APP_PATH" ]; then
        print_message "$GREEN" "Application installed successfully" "$SUCCESS"
    else
        print_message "$RED" "Failed to move application" "$ERROR"
        exit 1
    fi
}

# Codesign the app
codesign_app() {
    step_indicator 7 8 "Code Signing Application"
    
    print_message "$CYAN" "Applying ad-hoc signature..." "$INFO"
    wave_animation 1
    
    # Remove extended attributes
    xattr -cr "$FINAL_APP_PATH" 2>/dev/null
    
    # Ad-hoc sign
    codesign --force --deep --sign - "$FINAL_APP_PATH" 2>/dev/null &
    spinner $! "Code signing"
    
    # Verify signature
    if codesign --verify --verbose "$FINAL_APP_PATH" 2>/dev/null; then
        print_message "$GREEN" "Code signing successful" "$SUCCESS"
    else
        print_message "$YELLOW" "Code signing may have issues, but continuing..." "$INFO"
    fi
}

# Show credits with beautiful animation
show_credits() {
    if [ "$IS_INTERACTIVE" = true ]; then
      echo -e "\n${CYAN}╔═══════════════════════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${CYAN}║               ${BOLD}${YELLOW}AMAZING TEAMWORK!${RESET}${CYAN}            ║${RESET}"
        echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════════════════╣${RESET}"
        
        # Clean appreciation message
        printf "\n${BOLD}${YELLOW}Thanks to this amazing duo for making Hintify possible!${RESET}\n"
        
        # Simple animation
        local symbols=(">>>" "===" "***" ">>>")
        for i in {1..4}; do
            local symbol=${symbols[$((i % 4))]}
            printf "${CYAN}    %s ${YELLOW}TEAMWORK${CYAN} %s${RESET} " "$symbol" "$symbol"
            sleep 0.2
        done
        printf "\n\n"
    else
        echo ""
        echo "========================================="
        echo "               CREDITS"
        echo "========================================="
    fi
}

# Launch app with celebration
launch_app() {
    step_indicator 8 8 "Launching ${APP_DISPLAY_NAME}"
    
    print_message "$CYAN" "Opening ${APP_DISPLAY_NAME}..." "$ROCKET"
    
    open "$FINAL_APP_PATH" >/dev/null 2>&1 &
    
    if [ "$IS_INTERACTIVE" = true ]; then
        # Celebration animation with ASCII art
        echo -e "\n"
        local patterns=(">>> [*] [*] [*] <<<" "=== [+] [+] [+] ===" "~~~ [√] [√] [√] ~~~")
        for i in {1..3}; do
            local pattern=${patterns[$((i % 3))]}
            echo -e "${YELLOW}    ${pattern}${RESET}"
            sleep 0.15
        done
        
      echo -e "\n${GREEN}╔════════════════════════════════════════════════════════╗${RESET}"
        echo -e "${GREEN}║                                                        ║${RESET}"
        echo -e "${GREEN}║   ${BOLD}${WHITE}*** Installation Complete! ***${GREEN}║${RESET}"
        echo -e "${GREEN}║                                                        ║${RESET}"
        echo -e "${GREEN}║   ${CYAN}${APP_DISPLAY_NAME}${GREEN}                   ║${RESET}"
        echo -e "${GREEN}║   ${YELLOW}Version: ${LATEST_VERSION}${GREEN}                          ║${RESET}"
        echo -e "${GREEN}║   ${YELLOW}is now ready to use!${GREEN}                ║${RESET}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${RESET}"
        
        # Final celebration animation
        echo -e "\n"
        for i in {1..3}; do
            printf "${YELLOW}>>> ${CYAN}SUCCESS ${YELLOW}<<<${RESET} "
            sleep 0.15
        done
        echo -e "\n"
    else
        echo "Installation complete! ${APP_DISPLAY_NAME} has been launched."
    fi
}

# Error handler
handle_error() {
    print_message "$RED" "An error occurred during installation" "$ERROR"
    print_message "$YELLOW" "Cleaning up temporary files..." "$INFO"
    cleanup
    exit 1
}

# Main installation flow
main() {
    # Set error handling
    set -e
    trap handle_error ERR
    
    # Print header
    print_header
    
    # Start installation process
    print_message "$BOLD$CYAN" "Starting Hintify Installation Process" "$ROCKET"
    print_message "$WHITE" "This will take just a few moments..." "$INFO"
    
    if [ "$IS_INTERACTIVE" = true ]; then
        sleep 0.5
        wave_animation 1
    fi
    
    # Execute installation steps
    install_homebrew
    fetch_latest_release
    install_wget

    # Re-print header with version info
    print_header

    download_app
    extract_app
    move_to_applications
    codesign_app
    
    # Show appreciation for the amazing team
    show_credits
    
    launch_app
    
    # Clean up
    cleanup
    
    print_message "$BOLD$GREEN" "Thank you for installing Hintify ${LATEST_VERSION}!" "$MAGIC"
    print_message "$CYAN" "Visit ${WEBSITE_URL} for more information" "$INFO"

    if [ "$IS_INTERACTIVE" = true ]; then
        echo ""
        echo -e "${YELLOW}═══════════════════════════════════════════════════════════${RESET}"
        echo -e "${CYAN}📦 Installed Version: ${BOLD}${LATEST_VERSION}${RESET}"
        echo -e "${CYAN}🌐 Website: ${BOLD}${WEBSITE_URL}${RESET}"
        echo -e "${CYAN}📂 Location: ${BOLD}${FINAL_APP_PATH}${RESET}"
        echo -e "${YELLOW}═══════════════════════════════════════════════════════════${RESET}"
    fi
}

# Run main function
main "$@"
