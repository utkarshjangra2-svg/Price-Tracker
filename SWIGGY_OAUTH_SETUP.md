# Swiggy OAuth Setup Guide

## Overview
This guide walks through setting up Swiggy OAuth authentication for the Swiggy Food MCP integration. This allows users to authenticate with Swiggy and enable food ordering features.

## Prerequisites
- Swiggy Partner/Developer account
- OAuth credentials from Swiggy (Client ID and Client Secret)
- Backend API running on a publicly accessible URL (for OAuth callbacks)

## Step 1: Register OAuth Application with Swiggy

1. Go to [Swiggy Developer Console](https://developer.swiggy.com)
2. Create a new OAuth application
3. Set the following:
   - **Application Name**: Your app name (e.g., "Price Optimizer")
   - **Redirect URI**: `https://your-domain.com/api/auth/swiggy/callback`
   - **Scopes**: Select at least:
     - `food:order_placed`
     - `food:order_history`
     - `restaurants:search`
     - `restaurants:menu`

4. Obtain your credentials:
   - **Client ID**: Copy this value
   - **Client Secret**: Copy this value  
   - **MCP Token** (optional): If Swiggy has a specific MCP bearer token

## Step 2: Configure Environment Variables

Add the following to your `.env` file:

```env
# Swiggy OAuth Configuration
SWIGGY_OAUTH_CLIENT_ID=your_client_id_here
SWIGGY_OAUTH_CLIENT_SECRET=your_client_secret_here
SWIGGY_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/swiggy/callback

# Swiggy Food MCP
SWIGGY_FOOD_MCP_URL=https://mcp.swiggy.com/food
SWIGGY_FOOD_MCP_TIMEOUT_MS=15000

# Optional: If Swiggy MCP requires a bearer token
SWIGGY_MCP_BEARER_TOKEN=your_mcp_token_here
```

## Step 3: Database Migration

The User model has been updated to include Swiggy OAuth fields:

```javascript
swiggy: {
  linked: Boolean,           // Whether account is linked
  accessToken: String,       // OAuth access token
  refreshToken: String,      // OAuth refresh token
  tokenExpiresAt: Date,      // When access token expires
  userId: String,            // Swiggy user ID
  phoneNumber: String,       // User's phone
  name: String,              // User's name
  email: String,             // User's email
  linkedAt: Date,            // When linked
  lastVerifiedAt: Date       // Last verification time
}
```

If you have existing users in MongoDB, update the schema:
```bash
# Using Mongoose
db.users.updateMany({}, {$set: {swiggy: {linked: false}}})
```

## Step 4: OAuth Flow Implementation

### Frontend Integration

1. **Initiate OAuth Flow**: Get the authorization URL

```javascript
const response = await fetch('/api/auth/swiggy/link/url', {
  headers: { Authorization: `Bearer ${userToken}` }
});
const { url } = await response.json();
window.location.href = url; // Redirect to Swiggy OAuth
```

2. **Handle Callback**: After user authorizes, Swiggy redirects to your callback:
   - The backend automatically exchanges the code for an access token
   - Frontend receives the token and stores it

3. **Link Account**: Associate OAuth token with user account

```javascript
await fetch('/api/auth/swiggy/link', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`
  },
  body: JSON.stringify({
    accessToken: oauthToken.accessToken,
    refreshToken: oauthToken.refreshToken,
    expiresIn: oauthToken.expiresIn
  })
});
```

### Backend Routes

#### Get OAuth Link URL
```
GET /api/auth/swiggy/link/url
Authorization: Bearer {userToken}

Response: { url: "https://auth.swiggy.com/oauth/authorize?..." }
```

#### OAuth Callback (Swiggy redirects here)
```
GET /api/auth/swiggy/callback?code={code}&state={state}

Response: { accessToken, refreshToken, expiresIn }
```

#### Link Account
```
POST /api/auth/swiggy/link
Authorization: Bearer {userToken}
Body: { accessToken, refreshToken, expiresIn }

Response: { msg, swiggy: { userId, name, email }, user }
```

#### Check Link Status
```
GET /api/auth/swiggy/status
Authorization: Bearer {userToken}

Response: { swiggy: { linked, userId, name, email, tokenExpired } }
```

#### Unlink Account
```
POST /api/auth/swiggy/unlink
Authorization: Bearer {userToken}

Response: { msg: "Swiggy account disconnected", user }
```

## Step 5: Using Authenticated Swiggy Search

Once a user links their Swiggy account, use authenticated MCP calls:

```javascript
import { searchSwiggyFoodUser } from '../services/swiggyFoodMcpService.js';

const results = await searchSwiggyFoodUser({
  userId: user._id,
  query: 'biryani',
  location: 'Faridabad',
  limit: 8
});

// Result includes: { connected, tool, restaurants, authenticated: true }
```

## Step 6: Token Refresh

Tokens automatically refresh when they expire. The service:
1. Checks if token is expired before making requests
2. Uses refresh token to get a new access token
3. Stores the new token in the database
4. No user action needed

## Troubleshooting

### "Swiggy OAuth is not configured"
- Check that `SWIGGY_OAUTH_CLIENT_ID` and `SWIGGY_OAUTH_CLIENT_SECRET` are set
- Ensure `.env` is loaded before the app starts

### "Authentication required" (invalid_token)
- Verify the access token is freshly obtained
- Check token hasn't expired
- Confirm the OAuth app has the required scopes

### Token refresh fails
- Ensure refresh token is stored in the database
- Check user hasn't manually unlinked their account
- Verify no concurrent token refresh requests

### Callback never fires
- Confirm redirect URI matches exactly in Swiggy console
- Check that your backend is accessible at the callback URL
- Verify HTTPS is used (not HTTP)

## Testing

### Test OAuth Setup

```bash
# 1. Get OAuth URL
curl -H "Authorization: Bearer {userToken}" \
  http://localhost:3000/api/auth/swiggy/link/url

# 2. Check link status
curl -H "Authorization: Bearer {userToken}" \
  http://localhost:3000/api/auth/swiggy/status

# 3. Search with authenticated user
curl -H "Authorization: Bearer {userToken}" \
  "http://localhost:3000/api/food/search?q=biryani&userId={userId}"
```

## Security Considerations

1. **Never expose Client Secret**: Keep it server-side only
2. **HTTPS Required**: OAuth callbacks must be over HTTPS
3. **Token Storage**: Access tokens stored in MongoDB, consider encrypting
4. **Token Expiry**: Always handle expired tokens gracefully
5. **Scope Minimization**: Only request scopes your app needs
6. **CSRF Protection**: Use state parameter in OAuth flow (already implemented)

## API Documentation

See the [Swiggy Developer API Docs](https://developer.swiggy.com/docs) for:
- Available MCP tools
- Device and menu endpoints
- Order placement and tracking
- User profile management

## Support

For issues:
1. Check the troubleshooting section above
2. Review server logs for error messages
3. Verify environment variables are set correctly
4. Contact Swiggy developer support if OAuth issues persist
