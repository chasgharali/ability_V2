# Quick Start: Fix User Auto-Deletion Issue

## The Problem
Your admin user `tadmin.ability@yopmail.com` was automatically deleted because of a MongoDB TTL index that deletes users after 7 days.

## The Solution (3 Simple Steps)

### Step 1: Remove the TTL Index

Run this command to check and remove the problematic index:

```bash
cd /Users/asgharali/Desktop/Ability/ability_V2
node check-user-indexes.js
```

**Expected output:**
- If TTL index found: `✅ TTL index removed successfully!`
- If no TTL index: `✅ GOOD NEWS: No TTL index found`

### Step 2: Recreate Your Admin User

Run this command to recreate the deleted admin:

```bash
node create-admin-user.js
```

**Default credentials created:**
- Email: `tadmin.ability@yopmail.com`
- Password: `Admin@123`

⚠️ **Change the password in the script before running if you want a different password!**

### Step 3: Verify Everything Works

```bash
# Start your server
cd server
npm start

# Login with the admin credentials and verify everything works
```

## If You Get Network Errors

If you see `ECONNREFUSED` or `querySrv` errors:

1. **Check Internet Connection**: Make sure you're online
2. **Check VPN**: Disable VPN temporarily
3. **Check MongoDB Atlas**: Verify your IP is whitelisted in MongoDB Atlas dashboard
4. **Try Again**: Wait a minute and retry

## What Was Fixed in the Code

✅ All code changes are already in place:
- User model has NO TTL indexes
- Token cleanup uses application logic (not MongoDB TTL)
- Migration scripts are available
- Multiple safeguards added

## How to Prevent This in the Future

The codebase now has these protections:

1. **No TTL in schemas** - All models are clean
2. **Application-level cleanup** - Tokens are cleaned up by code, not MongoDB
3. **Warning comments** - Developers are warned not to add TTL indexes
4. **This only needs to be run ONCE** - After running the fix, users won't be auto-deleted

## Quick Check: Is My Database Fixed?

Run this to verify:

```bash
node check-user-indexes.js
```

Look for: `✅ GOOD NEWS: No TTL index found on users collection.`

## Summary

- 📋 **Cause**: MongoDB TTL index auto-deleting users after 7 days
- ✅ **Code**: Already fixed (no more TTL indexes in schemas)
- ⚠️ **Action Needed**: Run the fix scripts once
- 🔒 **Future**: Protected with multiple safeguards

---

## Detailed Documentation

For more information, see: `CRITICAL-USER-DELETION-FIX.md`

## Need Help?

1. Check if your server is running
2. Check MongoDB connection
3. Review server logs: `server/logs/error.log`
4. Verify you have network access to MongoDB Atlas
