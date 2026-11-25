# Swiggy OAuth Implementation Summary

## What Was Implemented

### 1. **User Model Update**
- Added `swiggy` OAuth field to store authentication data
- Tracks access token, refresh token, expiration, user ID, and linking metadata

### 2. **Swiggy OAuth Service** (`backend/services/swiggyOAuthService.js`)
- `generateOAuthState()` - Creates state tokens for CSRF protection
- `verifyOAuthState()` - Validates state tokens
- `getSwiggyAuthorizeUrl()` - Generates OAuth authorization URL
- `exchangeCodeForToken()` - Exchanges auth code for access token
- `refreshAccessToken()` - Auto-refreshes expired tokens
- `getUserSwiggyProfile()` - Fetches user profile from Swiggy
- `linkSwiggyAccount()` - Associates Swiggy OAuth with user account
- `unlinkSwiggyAccount()` - Removes Swiggy OAuth link
- `getSwiggyAccessToken()` - Gets valid token with auto-refresh
- `getSwiggyLinkStatus()` - Checks account linking status

### 3. **Auth Controller OAuth Endpoints**
- `getSwiggyLinkButtonUrl` - Returns OAuth authorization URL
- `getSwiggyAccountLinkStatus` - Checks if user's Swiggy is linked
- `swiggyOAuthCallback` - Handles OAuth callback from Swiggy
- `linkSwiggyWithToken` - Links account using OAuth token
- `unlinkSwiggyFromAccount` - Unlinks Swiggy account

### 4. **Auth Routes** (`backend/routes/auth.js`)
Added endpoints:
- `GET /api/auth/swiggy/link/url` - Get OAuth link URL
- `GET /api/auth/swiggy/status` - Check link status
- `GET /api/auth/swiggy/callback` - OAuth callback (Swiggy redirects here)
- `POST /api/auth/swiggy/link` - Link account with token
- `POST /api/auth/swiggy/unlink` - Unlink account

### 5. **Enhanced Swiggy MCP Service** (`backend/services/swiggyFoodMcpService.js`)
- `connectUserSwiggyFoodMcp()` - Establishes authenticated MCP connection
- `getUserSwiggyFoodStatus()` - Gets status of user's authenticated connection
- `callUserTool()` - Calls MCP tool with user's OAuth token
- `searchSwiggyFoodUser()` - Authenticated restaurant search
- User client caching for performance

### 6. **Updated Swiggy Food Routes** (`backend/routes/swiggyFood.js`)
Added authenticated endpoints:
- `GET /api/swiggy-food/status/user` - User's connection status
- `GET /api/swiggy-food/search?q=query` - Authenticated search

### 7. **Documentation**
- `SWIGGY_OAUTH_SETUP.md` - Complete setup guide
- `.env.example` - Environment variables template

## Environment Variables Required

```env
SWIGGY_OAUTH_CLIENT_ID=your_client_id
SWIGGY_OAUTH_CLIENT_SECRET=your_client_secret
SWIGGY_OAUTH_REDIRECT_URI=https://your-domain.com/api/auth/swiggy/callback
SWIGGY_FOOD_MCP_URL=https://mcp.swiggy.com/food
```

## OAuth Flow

1. **User initiates login**
   ```
   GET /api/auth/swiggy/link/url (with auth token)
   → Returns OAuth authorization URL
   ```

2. **User authorizes on Swiggy**
   - Sends to Swiggy's OAuth consent page
   - User approves scopes

3. **Swiggy redirects to callback**
   ```
   GET /api/auth/swiggy/callback?code=XXX&state=YYY
   ```

4. **Link account with token**
   ```
   POST /api/auth/swiggy/link
   Body: { accessToken, refreshToken, expiresIn }
   ```

5. **Use authenticated MCP calls**
   ```
   GET /api/swiggy-food/search?q=biryani
   (Uses user's linked Swiggy token)
   ```

## Key Features

✅ **Automatic Token Refresh** - Tokens are auto-refreshed when expired
✅ **CSRF Protection** - State parameter in OAuth flow
✅ **Secure Token Storage** - Stored in MongoDB (can be encrypted)
✅ **Multi-User Support** - Each user has their own cached MCP connection
✅ **Connection Pooling** - Cached connections per user for better performance
✅ **Error Handling** - Clear error messages with helpful tips
✅ **Backward Compatible** - Existing unauthenticated search still works

## Testing

### 1. Check Swiggy MCP Status (No Auth)
```bash
curl http://localhost:3000/api/swiggy-food/status
```

### 2. Get OAuth Link URL (Requires Auth)
```bash
curl -H "Authorization: Bearer {userToken}" \
  http://localhost:3000/api/auth/swiggy/link/url
```

### 3. Check OAuth Link Status
```bash
curl -H "Authorization: Bearer {userToken}" \
  http://localhost:3000/api/auth/swiggy/status
```

### 4. Search with Authenticated User
```bash
curl -H "Authorization: Bearer {userToken}" \
  "http://localhost:3000/api/swiggy-food/search?q=biryani"
```

## Known Limitations

- State tokens stored in-memory (use Redis in production)
- No token encryption in database (add encryption middleware if needed)
- Single MCP endpoint (can add failover endpoints if needed)

## Next Steps

1. Register OAuth app with Swiggy developer console
2. Get Client ID and Client Secret
3. Add environment variables
4. Deploy to HTTPS (OAuth requires HTTPS)
5. Users can now link their Swiggy accounts
6. Use authenticated search endpoints

## Support

For setup issues, refer to `SWIGGY_OAUTH_SETUP.md` troubleshooting section.
