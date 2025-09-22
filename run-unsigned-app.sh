#!/bin/bash

echo "This script helps you run unsigned apps on macOS"
echo "Choose an option:"
echo "1. Remove quarantine attribute from the app"
echo "2. Show how to disable Gatekeeper temporarily"
echo "3. Exit"

read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo "Removing quarantine attribute from Hintify app..."
        xattr -d com.apple.quarantine "Hintify SnapAssist AI (Dev).app" 2>/dev/null
        echo "Done! You should now be able to run the app normally."
        ;;
    2)
        echo "To temporarily disable Gatekeeper:"
        echo "1. Run: sudo spctl --master-disable"
        echo "2. Install and run your app"
        echo "3. Re-enable with: sudo spctl --master-enable"
        echo ""
        echo "WARNING: This disables system security. Re-enable it after testing!"
        ;;
    3)
        echo "Exiting..."
        exit 0
        ;;
    *)
        echo "Invalid choice. Exiting..."
        exit 1
        ;;
esac