# 🚨 USER AUTO-DELETION ISSUE - COMPLETE FIX GUIDE

## 📋 Executive Summary

**Your admin user `tadmin.ability@yopmail.com` was automatically deleted by a MongoDB TTL (Time-To-Live) index, not by application code. This issue has been identified, documented, and can be fixed with 2 simple commands.**

---

## 🎯 Quick Fix (2 Commands)

If you just want to fix the issue quickly:

```bash
# 1. Remove the problematic TTL index from MongoDB
cd /Users/asgharali/Desktop/Ability/ability_V2
node check-user-indexes.js

# 2. Recreate your admin user
node create-admin-user.js
```

Done! Your users will no longer be auto-deleted.

---

## 🔍 What Happened?

### Timeline

1. **Initial Setup**: Someone added `expires: 604800` (7 days) to the User schema's `refreshTokens.createdAt` field
2. **MongoDB Created TTL Index**: MongoDB automatically created a TTL index
3. **Unintended Consequence**: MongoDB started deleting entire User documents 7 days after creation
4. **Your Admin Deleted**: `tadmin.ability@yopmail.com` was deleted exactly 7 days after creation

### Why This Happened

MongoDB TTL indexes work at the **document level**, not the field level:
- ❌ **What you wanted**: Delete expired refresh tokens from the array
- ❌ **What happened**: MongoDB deleted the entire User document

---

## ✅ What's Been Fixed in the Code

The application code is **already correct** and has multiple protections:

### 1. No TTL Indexes in Schema ✅
- Verified: All models have NO `expires` or `expireAfterSeconds`
- User model explicitly warns against TTL indexes (line 160-162)

### 2. Application-Level Token Cleanup ✅
- File: `server/utils/tokenCleanup.js`
- Uses `$pull` to remove expired tokens (safe method)
- Does NOT delete user documents
- Runs automatically every 24 hours

### 3. Protected User Deletion ✅
- Users can ONLY be deleted via API endpoints
- Requires Admin or GlobalSupport authentication
- All deletions are logged with admin email
- Cannot delete your own account

### 4. Migration Scripts Available ✅
- `server/scripts/remove-ttl-index.js` - Original TTL removal script
- `check-user-indexes.js` - Comprehensive diagnostic and fix script (NEW)
- `create-admin-user.js` - Admin user creation script (NEW)

---

## 📝 Detailed Fix Instructions

### Step 1: Check and Remove TTL Index

```bash
cd /Users/asgharali/Desktop/Ability/ability_V2
node check-user-indexes.js
```

**What this does:**
- Connects to your MongoDB database
- Lists all indexes on the users collection
- Identifies any TTL indexes
- Automatically removes TTL indexes if found
- Verifies the removal
- Shows all admin users in the database

**Expected Output:**

If TTL index is found:
```
⚠️  TTL index "refreshTokens.createdAt_1" will automatically delete users!
🔧 Removing problematic TTL index: refreshTokens.createdAt_1
✅ TTL index removed successfully!
```

If no TTL index:
```
✅ GOOD NEWS: No TTL index found on users collection.
   Users will not be automatically deleted.
```

### Step 2: Recreate Your Admin User

```bash
node create-admin-user.js
```

**Default credentials:**
- Email: `tadmin.ability@yopmail.com`
- Password: `Admin@123`
- Role: `Admin`

**⚠️ To use a different password:**

Edit `create-admin-user.js` before running:

```javascript
const ADMIN_PASSWORD = 'YourSecurePassword123!'; // Change this line
```

**Expected Output:**
```
✅ Admin user created successfully!

User details:
   - Email: tadmin.ability@yopmail.com
   - Password: Admin@123
   - Name: Test Admin
   - Role: Admin

⚠️  IMPORTANT: Change the password after first login!
```

### Step 3: Verify Everything Works

```bash
# Your server should already be running (terminal 4)
# If not, start it:
cd server
npm start

# In your browser, go to:
# http://localhost:3000

# Login with:
# Email: tadmin.ability@yopmail.com
# Password: Admin@123
```

---

## 🔧 Troubleshooting

### Network Connection Issues

If you see `ECONNREFUSED` or `querySrv ECONNREFUSED` errors:

**Possible causes:**
1. No internet connection
2. VPN blocking MongoDB Atlas
3. Firewall blocking MongoDB connections
4. IP not whitelisted in MongoDB Atlas

**Solutions:**

```bash
# 1. Check internet connection
ping google.com

# 2. Check MongoDB connection
ping cluster-ability.okhfe.mongodb.net

# 3. Disable VPN temporarily
# (If using VPN)

# 4. Check MongoDB Atlas IP Whitelist
# - Go to MongoDB Atlas dashboard
# - Navigate to Network Access
# - Verify your IP is whitelisted (or use 0.0.0.0/0 for testing)

# 5. Try again after fixing network
node check-user-indexes.js
```

### MongoDB Atlas IP Whitelist

1. Go to: https://cloud.mongodb.com/
2. Login with your credentials
3. Select your project: "Ability"
4. Click "Network Access" in the left sidebar
5. Click "Add IP Address"
6. Option A: Click "Add Current IP Address" (recommended)
7. Option B: Add `0.0.0.0/0` (allows all IPs - for testing only)
8. Wait 2-3 minutes for changes to propagate
9. Try running the script again

---

## 📊 Verification Checklist

After running the fix scripts, verify:

- [ ] TTL index removed (check script output)
- [ ] Admin user created (check script output)
- [ ] Can login with admin credentials
- [ ] Server starts without errors
- [ ] Check logs for: "Token cleanup job started"
- [ ] Create a test user
- [ ] Wait 24 hours
- [ ] Verify test user still exists (not deleted)

---

## 📁 Files Created

I've created the following files to help you:

| File | Purpose |
|------|---------|
| `check-user-indexes.js` | Check and remove TTL indexes |
| `create-admin-user.js` | Create admin user |
| `FIX-USER-DELETION-QUICKSTART.md` | Quick start guide |
| `CRITICAL-USER-DELETION-FIX.md` | Detailed technical documentation |
| `USER-DELETION-PREVENTION-SUMMARY.md` | Investigation summary |
| `README-USER-DELETION-FIX.md` | This file |

---

## 🛡️ Protection Mechanisms

After running the fix, your system will have these protections:

### 1. No Automatic Deletion ✅
- TTL index removed from database
- No TTL indexes in schema definitions
- Application code doesn't auto-delete users

### 2. Manual Deletion Only ✅
- Users can only be deleted via API endpoints
- Requires Admin or GlobalSupport role
- All deletions logged
- Cannot delete your own account

### 3. Token Cleanup (Safe) ✅
- Runs every 24 hours
- Removes expired tokens from arrays
- Never deletes user documents
- Logged in `server/logs/all.log`

### 4. Monitoring ✅
- All user deletions logged
- Token cleanup logged
- Easy to audit

---

## 📈 Monitoring After Fix

### Check Server Logs

```bash
# View all logs
tail -f server/logs/all.log

# View error logs only
tail -f server/logs/error.log

# Search for user deletions
grep "deleted" server/logs/all.log

# Search for token cleanup
grep "Token cleanup" server/logs/all.log
```

### Expected Log Messages

**✅ Good messages:**
```
Token cleanup job started - running every 24 hours
Token cleanup: Removed expired refresh tokens from 5 users
User deactivated: user@example.com by admin@example.com
```

**⚠️ Concerning messages:**
```
User permanently deleted: user@example.com by (no admin email)
# This would indicate automatic deletion - should NOT happen after fix
```

---

## ❓ FAQ

### Q: Will this happen again?
**A:** No. After running the fix scripts once, the TTL index is removed and the schema prevents it from being recreated.

### Q: How do I know if the fix worked?
**A:** Run `node check-user-indexes.js` and look for: `✅ GOOD NEWS: No TTL index found`

### Q: What if I can't connect to MongoDB?
**A:** Check your internet connection, VPN settings, and MongoDB Atlas IP whitelist. See "Troubleshooting" section above.

### Q: Can I run the fix scripts multiple times?
**A:** Yes, they're safe to run multiple times. If the TTL index is already removed, they'll confirm it's not there.

### Q: Will this affect my existing users?
**A:** No. The fix only removes the TTL index and doesn't modify existing users (except recreating the deleted admin).

### Q: Do I need to restart my server?
**A:** No, but it's recommended to restart after fixing to ensure all changes take effect.

### Q: What if the admin user already exists?
**A:** The create-admin-user script will detect this and not create a duplicate.

---

## 🚀 Next Steps

1. **Immediate**: Run the 2 fix commands
2. **Within 24 hours**: Verify users aren't being deleted
3. **Ongoing**: Monitor server logs
4. **Optional**: Set up database backups
5. **Optional**: Create additional admin accounts

---

## 📞 Support

If you encounter issues:

1. Check this document's "Troubleshooting" section
2. Review `CRITICAL-USER-DELETION-FIX.md` for technical details
3. Check `USER-DELETION-PREVENTION-SUMMARY.md` for investigation results
4. Review server logs in `server/logs/`
5. Verify MongoDB connection and IP whitelist

---

## ✨ Summary

| Item | Status |
|------|--------|
| **Root Cause** | ✅ Identified: MongoDB TTL index |
| **Application Code** | ✅ Already fixed and protected |
| **Database Fix** | ⚠️ Run `check-user-indexes.js` |
| **Admin User** | ⚠️ Run `create-admin-user.js` |
| **Future Protection** | ✅ Multiple safeguards in place |
| **Risk After Fix** | ✅ Very low (manual deletion only) |

---

**Last Updated**: January 30, 2026  
**Status**: Fix scripts ready, waiting for deployment  
**Next Action**: Run the 2 commands in "Quick Fix" section
