# CRITICAL: User Auto-Deletion Issue - Fixed

## Problem Summary

Your admin user `tadmin.ability@yopmail.com` was automatically deleted due to a **MongoDB TTL (Time-To-Live) index** that was incorrectly configured on the User collection. This index was set to delete entire user documents after 7 days.

## Root Cause

The issue was caused by a TTL index that was likely created on the `refreshTokens.createdAt` field. MongoDB TTL indexes work at the **document level**, not the field level, which means:

- **Intended behavior**: Delete expired refresh tokens from the array
- **Actual behavior**: Delete the entire User document after 7 days

This is a critical bug that has already been identified in the codebase (see `server/models/User.js` lines 160-162 and `server/utils/tokenCleanup.js`).

## Solution Implemented

### 1. Code Changes (Already in place)

The following have been implemented:

- ✅ User model (`server/models/User.js`) - TTL index removed from schema
- ✅ Token cleanup utility (`server/utils/tokenCleanup.js`) - Application-level token cleanup that does NOT delete users
- ✅ Migration script (`server/scripts/remove-ttl-index.js`) - Removes the TTL index from the database
- ✅ New diagnostic script (`check-user-indexes.js`) - Comprehensive index checker and fixer

### 2. Required Actions

You need to run the index removal script to remove the TTL index from your MongoDB database:

#### Option A: Run the diagnostic script (Recommended)

```bash
cd /Users/asgharali/Desktop/Ability/ability_V2
node check-user-indexes.js
```

This script will:
- Check all indexes on the users collection
- Automatically remove any TTL indexes found
- Verify the TTL index was removed
- Show all current admin users
- Check if `tadmin.ability@yopmail.com` exists

#### Option B: Run the original migration script

```bash
cd /Users/asgharali/Desktop/Ability/ability_V2
node server/scripts/remove-ttl-index.js
```

### 3. Recreate the Deleted Admin User

Since your admin user was deleted, you'll need to recreate it:

#### Using the seed users script:

```bash
cd /Users/asgharali/Desktop/Ability/ability_V2
node server/scripts/seedUsers.js
```

This will create a default admin user.

#### Or create manually via API/Database:

You can create a new admin user through your application's registration process or directly in the database.

## Verification Steps

After running the fix script, verify the issue is resolved:

1. **Check indexes**:
   ```bash
   node check-user-indexes.js
   ```
   
   Should show: `✅ GOOD NEWS: No TTL index found on users collection.`

2. **Verify users are not being deleted**:
   - Create a test admin user
   - Wait 24 hours
   - Verify the user still exists

3. **Check server logs**:
   - You should see: `Token cleanup job started - running every 24 hours`
   - You should see: `Token cleanup: Removed expired refresh tokens from X users`
   - You should NOT see any user deletion logs

## Why This Happened

1. **Initial Implementation**: Someone likely added `expires: 604800` (7 days in seconds) to the `refreshTokens.createdAt` field in the User schema
2. **MongoDB Behavior**: MongoDB created a TTL index on that field
3. **Unintended Consequence**: MongoDB started deleting entire User documents (not just the tokens) 7 days after the `refreshTokens.createdAt` timestamp
4. **Your Admin User**: Was likely created 7 days before it disappeared, and was automatically deleted by MongoDB

## Current Protection Mechanisms

The codebase now has multiple protections:

1. **No TTL in Schema**: The User model explicitly does NOT have `expires` on any fields
2. **Warning Comments**: Code comments warn developers not to add TTL indexes (see `server/models/User.js` line 160-162)
3. **Application-Level Cleanup**: Token cleanup is now handled by application code (`server/utils/tokenCleanup.js`) which only removes tokens, not users
4. **Automatic Startup**: Token cleanup job starts automatically when the server starts (see `server/index.js` line 258)

## Network Issue Resolution

If you're getting `ECONNREFUSED` errors when running the scripts, check:

1. **Internet Connection**: Make sure you have internet access
2. **VPN/Firewall**: Disable VPN or check firewall settings
3. **DNS Resolution**: Try pinging the MongoDB server:
   ```bash
   ping cluster-ability.okhfe.mongodb.net
   ```
4. **MongoDB Atlas IP Whitelist**: Verify your IP address is whitelisted in MongoDB Atlas

## Summary

- ❌ **Problem**: TTL index was automatically deleting users after 7 days
- ✅ **Fixed in Code**: All schema and application code is correct
- ⚠️ **Action Required**: Run `node check-user-indexes.js` to remove the TTL index from database
- ⚠️ **Action Required**: Recreate your admin user `tadmin.ability@yopmail.com`
- ✅ **Future Protection**: Multiple safeguards in place to prevent this from happening again

## Questions?

If you encounter any issues:

1. Check the server logs in `server/logs/`
2. Verify MongoDB connection is working
3. Run the diagnostic script to check index status
4. Check if other users are being deleted unexpectedly

---

**Important**: After running the fix script, your users will be safe from automatic deletion. The token cleanup will only remove expired refresh tokens (in the refreshTokens array), not the users themselves.
