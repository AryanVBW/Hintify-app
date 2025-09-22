#!/bin/bash

# Test authentication deep link with comprehensive user data
# This script simulates what the website should send to the app

echo "🔗 Testing Hintify authentication deep link..."

# Sample user data (replace with actual data from your website)
USER_ID="user_2abc123def456"
EMAIL="john.doe@example.com"
NAME="John Doe"
FIRST_NAME="John"
LAST_NAME="Doe"
IMAGE_URL="https://img.clerk.com/preview.png"
USERNAME="johndoe"
PROVIDER="clerk"
TIMESTAMP=$(date +%s)

# Build the comprehensive deep link URL with all parameters
DEEP_LINK="hintify://auth-success?userId=${USER_ID}&email=${EMAIL}&name=${NAME}&firstName=${FIRST_NAME}&lastName=${LAST_NAME}&imageUrl=${IMAGE_URL}&username=${USERNAME}&provider=${PROVIDER}&timestamp=${TIMESTAMP}"

echo "Deep link URL:"
echo "$DEEP_LINK"
echo ""
echo "User data being transferred:"
echo "  • User ID: $USER_ID"
echo "  • Email: $EMAIL"
echo "  • Full Name: $NAME"
echo "  • First Name: $FIRST_NAME"
echo "  • Last Name: $LAST_NAME"
echo "  • Username: $USERNAME"
echo "  • Image URL: $IMAGE_URL"
echo "  • Provider: $PROVIDER"
echo "  • Timestamp: $TIMESTAMP"
echo ""
echo "Opening deep link..."

# Open the deep link (this will trigger the app if it's running)
open "$DEEP_LINK"

echo "✅ Deep link sent to app"
echo ""
echo "Expected behavior:"
echo "1. 📨 App should receive the authentication data with full logging"
echo "2. 🔑 User should be logged in automatically"
echo "3. 📝 User info should be displayed in the top-right corner (name + avatar)"
echo "4. 🚪 Auth window (if open) should close automatically"
echo "5. 🎯 Main window should show the user as authenticated"
echo "6. 🏁 Status should show 'Authentication successful! Ready to process images.'"
echo "7. 🎉 Welcome message should appear in the main area"
echo ""
echo "Debug: Check the app's developer console for detailed logs"