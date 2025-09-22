# Hintify Authentication Debug Guide

## Issue: User details not transferring from website to app

### What was fixed:

1. **Enhanced Deep Link Parsing**: 
   - Now supports multiple parameter name formats (userId, user_id, id)
   - Handles various field names for email, name, image URL
   - Includes fallbacks for different authentication providers

2. **Improved Error Handling**:
   - Better validation of essential user data
   - Comprehensive logging of received authentication data
   - Graceful handling of missing or incomplete data

3. **Enhanced User Interface Updates**:
   - Better user name display with multiple fallback options
   - Improved avatar handling with error fallbacks
   - More detailed console logging for debugging

### Expected Deep Link Format:

The website should send a deep link in this format:
```
hintify://auth-success?userId=123&email=user@example.com&name=John%20Doe&imageUrl=https://example.com/avatar.jpg&provider=google
```

### Supported Parameters:

**User ID**: `userId`, `user_id`, `id`
**Email**: `email`, `userEmail`
**Name**: `name`, `userName`, `displayName`
**Image**: `imageUrl`, `image_url`, `avatar`, `picture`
**Additional**: `firstName`, `lastName`, `provider`, `accessToken`

### Testing:

1. **Build and run the app**:
   ```bash
   npm run build-mac-dev
   ```

2. **Test authentication flow**:
   ```bash
   # Run the test script to simulate website authentication
   ./test-auth-deeplink.sh
   ```

3. **Check console logs** for detailed authentication data reception

### Debugging Steps:

1. **Enable Developer Tools** in the app to see console logs
2. **Monitor the main process logs** when deep links are received
3. **Check the auth window logs** when authentication completes
4. **Verify user data storage** in electron-store

### Common Issues:

1. **URL Encoding**: Ensure the website properly URL-encodes parameters
2. **Parameter Names**: Use the supported parameter name variations
3. **Required Fields**: At minimum, either `userId` or `email` must be present
4. **Deep Link Registration**: Ensure the app is registered as the protocol handler

### Website Integration:

Your website should redirect to the deep link after successful authentication:
```javascript
const authData = {
  userId: user.id,
  email: user.email,
  name: user.name,
  imageUrl: user.avatar,
  provider: 'google' // or whatever provider
};

const params = new URLSearchParams(authData);
const deepLink = `hintify://auth-success?${params.toString()}`;

// Redirect to the deep link
window.location.href = deepLink;
```