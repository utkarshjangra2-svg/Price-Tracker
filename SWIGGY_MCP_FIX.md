# Swiggy MCP Fix: Cross-City Search with Fallback Address

## Issue
Swiggy Food MCP was returning "no food results" when searching for cuisines in cities where the user didn't have a saved delivery address (e.g., searching for "halwa" in Faridabad when only Delhi is saved).

**Original Error Flow:**
```
[Swiggy] No address found, will return search-based estimates
MCP fetch failed for swiggy (Swiggy Food MCP returned no food results)
```

This caused Swiggy to immediately return mock fallback deals instead of attempting an actual MCP search.

## Root Cause
The `searchSwiggyFood()` function in `swiggyFoodMcpService.js` was:
1. Failing to find an exact address match for the requested location
2. Immediately returning mock estimated deals instead of using a fallback address
3. Not normalizing the raw MCP response properly
4. Not leveraging cross-city search capability that Zomato was already using

## Solution
Modified [backend/services/swiggyFoodMcpService.js](backend/services/swiggyFoodMcpService.js) to:

### 1. **Track Fallback Address** (Lines 330-349)
- Maintain both `addressId` and `fallbackAddressId` variables
- Always keep the first saved address as a fallback
- Only return mock deals if **both** are empty (not just the first one)

```javascript
let addressId = "";
let fallbackAddressId = "";
// ... get addresses ...
if (addresses.length > 0) {
  fallbackAddressId = String(addresses[0].address_id || addresses[0].id || "");
  addressId = fallbackAddressId;  // Start with fallback as best match
}
```

### 2. **Enhanced Query for Cross-City Search** (Lines 376-382)
- When using a fallback address, append the location to the search query
- Transform `"halwa"` → `"halwa Faridabad, 121001, Haryana"`
- This helps the MCP find restaurants even across cities

```javascript
let searchQuery = query || "food";
if (fallbackAddressId && location) {
  searchQuery = `${query || "food"} ${location}`.trim().replace(/\s+/g, " ");
  console.log(`[Swiggy] Cross-city search: query="${searchQuery}" addressId=${addressId} (fallback)`);
}
```

### 3. **Proper Response Normalization** (Line 444)
- Use `extractFoodResults()` to normalize raw MCP responses
- Ensures field mapping is consistent before downstream processing

```javascript
restaurants: extractFoodResults(restaurants.slice(0, limit), query),
```

### 4. **Enhanced Logging** (Lines 380-408)
Added detailed logging to track:
- Which query strategy is being used
- Response structure and types
- How many restaurants were found
- Current extraction logic

## Result
Now Swiggy MCP behaves identically to Zomato MCP:
1. Attempts to find exact address match for location
2. Falls back to first saved address with location-enhanced query if no exact match
3. Properly normalizes the response
4. Only returns mock estimates if genuinely no addresses exist

**Expected behavior after fix:**
```
[Swiggy] Cross-city search: query="halwa Faridabad, 121001, Haryana" addressId=952363061 (fallback)
[Swiggy] Extracted 6 restaurants from parsed data
✓ Swiggy now returns real MCP results for halwa in Faridabad
```

## Files Modified
- `backend/services/swiggyFoodMcpService.js` - searchSwiggyFood() function

## Testing
To verify the fix works:
```bash
node backend/testSwiggyDeals.js
# or
curl -X POST http://localhost:5000/api/deals/search \
  -H "Content-Type: application/json" \
  -d '{"location":"Faridabad, 121001, Haryana","cuisine":"halwa"}'
```

Should now return Swiggy deals alongside Zomato deals for cross-city searches.
