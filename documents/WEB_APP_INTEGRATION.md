# Web App Integration Guide for Clerk OAuth

This guide is for web app developers who need to implement the desktop authentication endpoint.

## Overview

The web app needs to handle a special route `/auth/desktop` that:
1. Receives a `state` parameter from the Electron app
2. Authenticates the user via Clerk (Google OAuth)
3. Redirects back to the Electron app with the session token and state

## Implementation

### Next.js Example

#### 1. Create the Desktop Auth Page

Create `app/auth/desktop/page.tsx` (or `pages/auth/desktop.tsx` for Pages Router):

```typescript
'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useClerk } from '@clerk/nextjs';
import { SignIn } from '@clerk/nextjs';

export default function DesktopAuthPage() {
  const searchParams = useSearchParams();
  const state = searchParams.get('state');
  const { isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();

  useEffect(() => {
    async function handleAuth() {
      // Validate state parameter exists
      if (!state) {
        console.error('Missing state parameter');
        return;
      }

      // If user is signed in, get token and redirect
      if (isSignedIn) {
        try {
          // Get Clerk session token
          const token = await getToken();
          
          if (!token) {
            console.error('Failed to get session token');
            return;
          }

          // Construct deep link URL
          const deepLinkUrl = `myapp://auth/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
          
          console.log('Redirecting to Electron app...');
          
          // Redirect to deep link
          window.location.href = deepLinkUrl;
          
          // Show success message
          setTimeout(() => {
            document.body.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
                <h1>✅ Authentication Successful</h1>
                <p>You can close this window and return to the Hintify app.</p>
                <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer;">
                  Close Window
                </button>
              </div>
            `;
          }, 1000);
          
        } catch (error) {
          console.error('Error getting token:', error);
        }
      }
    }

    handleAuth();
  }, [isSignedIn, state, getToken]);

  // Show sign-in form if not authenticated
  if (!isSignedIn) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h1>Sign in to Hintify</h1>
        <p>Sign in to continue to the desktop app</p>
        <SignIn 
          appearance={{
            elements: {
              rootBox: 'mx-auto',
            }
          }}
          redirectUrl={`/auth/desktop?state=${state}`}
        />
      </div>
    );
  }

  // Show loading state while redirecting
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Redirecting to Hintify...</h1>
      <p>Please wait while we complete your sign-in.</p>
    </div>
  );
}
```

#### 2. Configure Clerk Redirect URLs

In your Clerk Dashboard:

1. Go to **Configure** → **Paths**
2. Add to **Allowed redirect URLs**:
   - `myapp://auth/callback`
   - `http://localhost:3000/auth/desktop` (for development)
   - `https://hintify.nexus-v.tech/auth/desktop` (for production)

#### 3. Update Middleware (if using)

If you have Clerk middleware, ensure the `/auth/desktop` route is accessible:

```typescript
// middleware.ts
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/auth/desktop", // Allow unauthenticated access
  ],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

### React (Vite/CRA) Example

```typescript
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, SignIn } from '@clerk/clerk-react';

export function DesktopAuthPage() {
  const [searchParams] = useSearchParams();
  const state = searchParams.get('state');
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    async function handleAuth() {
      if (!state) {
        console.error('Missing state parameter');
        return;
      }

      if (isSignedIn) {
        try {
          const token = await getToken();
          
          if (!token) {
            console.error('Failed to get session token');
            return;
          }

          const deepLinkUrl = `myapp://auth/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
          
          window.location.href = deepLinkUrl;
          
          setTimeout(() => {
            document.body.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: system-ui;">
                <h1>✅ Authentication Successful</h1>
                <p>You can close this window and return to the Hintify app.</p>
              </div>
            `;
          }, 1000);
          
        } catch (error) {
          console.error('Error getting token:', error);
        }
      }
    }

    handleAuth();
  }, [isSignedIn, state, getToken]);

  if (!isSignedIn) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <h1>Sign in to Hintify</h1>
        <SignIn redirectUrl={`/auth/desktop?state=${state}`} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>Redirecting to Hintify...</h1>
    </div>
  );
}
```

## Security Considerations

### 1. Validate State Parameter

Always validate that the `state` parameter is present:

```typescript
if (!state || state.length === 0) {
  // Show error or redirect to home
  return <ErrorPage message="Invalid authentication request" />;
}
```

### 2. Token Handling

- **Never log tokens**: Don't console.log the actual token value
- **Use HTTPS**: Always use HTTPS in production
- **Short-lived tokens**: Clerk tokens are short-lived by default (good!)

### 3. Deep Link Security

The deep link URL format must be exact:

```typescript
// ✅ Correct
const url = `myapp://auth/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;

// ❌ Wrong - missing encoding
const url = `myapp://auth/callback?token=${token}&state=${state}`;

// ❌ Wrong - wrong protocol
const url = `hintify://auth/callback?token=${token}&state=${state}`;
```

## Testing

### Local Testing

1. **Start your web app**:
   ```bash
   npm run dev
   ```

2. **Test the route manually**:
   ```
   http://localhost:3000/auth/desktop?state=test-state-123
   ```

3. **Verify**:
   - Sign-in form appears
   - After signing in, redirect happens
   - Deep link URL is correct in browser address bar

### Testing Deep Link Redirect

You can test the deep link redirect without the Electron app:

```typescript
// Add a test mode
const isTestMode = searchParams.get('test') === 'true';

if (isTestMode) {
  // Instead of redirecting, show the URL
  console.log('Deep link URL:', deepLinkUrl);
  alert(`Would redirect to: ${deepLinkUrl}`);
  return;
}
```

Then test with:
```
http://localhost:3000/auth/desktop?state=test-123&test=true
```

## Error Handling

### Handle Missing State

```typescript
if (!state) {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>❌ Invalid Request</h1>
      <p>Missing authentication state parameter.</p>
      <a href="/">Return to Home</a>
    </div>
  );
}
```

### Handle Token Errors

```typescript
try {
  const token = await getToken();
  if (!token) {
    throw new Error('No token received');
  }
  // ... redirect
} catch (error) {
  console.error('Token error:', error);
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>❌ Authentication Error</h1>
      <p>Failed to complete authentication. Please try again.</p>
      <button onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  );
}
```

## Deployment Checklist

- [ ] `/auth/desktop` route is deployed
- [ ] Clerk redirect URLs are configured in dashboard
- [ ] HTTPS is enabled in production
- [ ] Error handling is implemented
- [ ] State parameter validation is in place
- [ ] Deep link URL format is correct (`myapp://auth/callback`)
- [ ] Success message is shown after redirect
- [ ] Tested on production domain

## Common Issues

### Issue: "Redirect URL not allowed"

**Solution**: Add `myapp://auth/callback` to Clerk's allowed redirect URLs in the dashboard.

### Issue: Deep link doesn't work

**Causes**:
1. Wrong protocol (`hintify://` instead of `myapp://`)
2. Missing URL encoding
3. Electron app not installed

**Solution**: Verify the deep link URL format and ensure the Electron app is installed.

### Issue: Token is null

**Causes**:
1. User not fully signed in
2. Clerk session not established
3. Network issues

**Solution**: Add error handling and retry logic.

## Support

For questions about the web app integration:
1. Check Clerk documentation: https://clerk.com/docs
2. Review this guide
3. Test with the provided examples
4. Contact the Electron app team with specific error messages

## Example Repository

See the complete example implementation at:
- Next.js App Router: [Link to example repo]
- Next.js Pages Router: [Link to example repo]
- React + Vite: [Link to example repo]

