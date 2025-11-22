# Quick Start: Database Migration

## Before You Begin

⚠️ **IMPORTANT**: Test the migration on a small subset of data first before running on the full database!

## Steps to Migrate

### 1. Backup Your Current Database
```bash
mongodump --uri="mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev" --out=./backup_before_migration_$(date +%Y%m%d_%H%M%S)
```

### 2. Verify Environment Setup
Ensure your `server/.env` file has the correct MongoDB URI:
```env
MONGODB_URI=mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev
```

### 3. Test BSON Reading (Optional)
Test if the script can read BSON files:
```bash
node -e "const {readBSONFile} = require('./migrate-db.js'); const docs = readBSONFile('./v1_db_dump/Prod_Ability/users.bson'); console.log('Found', docs.length, 'users');"
```

### 4. Run Migration
```bash
node migrate-db.js
```

The script will:
- Connect to the new database
- Read all BSON files from `v1_db_dump/Prod_Ability/`
- Transform and migrate data according to the new schema
- Show progress and any errors

### 5. Verify Migration
```bash
node verify-migration.js
```

This will check:
- Total counts for each collection
- Data integrity
- Relationship mappings
- Common issues

## What Gets Migrated

✅ **Users** - All user accounts with role mapping  
✅ **Events** - All events with settings and themes  
✅ **Companies → Booths** - Company data converted to booth structure  
✅ **Chats** - All chat conversations  
✅ **Notes** - All notes and instructions  
✅ **Interpreter Categories** - Interpreter category definitions  
✅ **Terms & Conditions** - Terms, privacy policies merged  
✅ **Booth Queues** - Queue entries for job seekers  
✅ **Video Calls** - Room/video call sessions  
✅ **Meeting Records** - Meeting history and data  
✅ **Event Interests** - Job seeker interests in events/booths  

## Common Issues & Solutions

### Issue: "User already exists"
- **Solution**: This is normal - the script skips duplicates to avoid data loss

### Issue: "Missing eventId" for booths
- **Solution**: Some old companies might not have events. These will be skipped.

### Issue: "Temporary password" warnings
- **Solution**: Users with `temp_password_123` need to reset their passwords after migration

### Issue: BSON reading errors
- **Solution**: The script will skip corrupted documents and continue. Check logs for details.

## Post-Migration Checklist

- [ ] Verify user counts match expected numbers
- [ ] Check that events have associated booths
- [ ] Verify booth-queue relationships
- [ ] Test user login (users may need password reset)
- [ ] Check that video calls link to meeting records
- [ ] Verify interpreter categories are accessible
- [ ] Test application functionality end-to-end

## Need Help?

1. Check `MIGRATION_README.md` for detailed documentation
2. Review console output for specific error messages
3. Run `verify-migration.js` to identify issues
4. Check that old database dump structure matches expected format

## Rollback

If something goes wrong:
```bash
mongorestore --uri="mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev" ./backup_before_migration_YYYYMMDD_HHMMSS
```

