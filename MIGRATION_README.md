# Database Migration Guide

This guide explains how to migrate data from the old database dump to the new MongoDB database.

## Overview

The migration script (`migrate-db.js`) reads BSON files from the old database dump and transforms them according to the new schema structure.

## Prerequisites

1. Node.js (v18 or higher)
2. MongoDB connection string for the new database
3. Old database dump in `v1_db_dump/Prod_Ability/` directory

## Setup

1. Ensure all dependencies are installed:
```bash
cd server
npm install
```

2. Set up environment variables in `server/.env`:
```env
MONGODB_URI=mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev
```

## Migration Process

### Step 1: Backup Current Database

Before running the migration, ensure you have a backup of the current database:
```bash
mongodump --uri="mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev" --out=./backup_before_migration
```

### Step 2: Run Migration

Run the migration script from the project root:
```bash
node migrate-db.js
```

The script will:
1. Connect to the new database
2. Read BSON files from `v1_db_dump/Prod_Ability/`
3. Transform data according to new schema
4. Insert data into the new database
5. Preserve relationships between collections using ObjectId mappings

### Step 3: Verify Migration

After migration, verify the data:
```bash
node verify-migration.js
```

## Migration Mapping

### Collections Mapped

| Old Collection | New Model | Notes |
|---------------|-----------|-------|
| `users` | `User` | Direct mapping with role transformation |
| `events` | `Event` | Direct mapping |
| `companies` | `Booth` | Companies become booths |
| `chats` | `Chat` | Direct mapping |
| `notes` | `Note` | Direct mapping |
| `interpretercategories` | `InterpreterCategory` | Direct mapping |
| `terms`, `termsofuses`, `privacypolicies` | `TermsConditions` | Merged into single collection |
| `jobseekerqueuevisits` | `BoothQueue` | Queue entries |
| `rooms` | `VideoCall` | Video call sessions |
| `meetingdatas` | `MeetingRecord` | Meeting records |
| `eventinterests` | `JobSeekerInterest` | Job seeker interests |

### Field Mappings

#### Users
- `userName` → `name`
- `password` → `hashedPassword` (will be re-hashed by pre-save hook)
- Role values are normalized (e.g., `jobseeker` → `JobSeeker`)

#### Events
- `startDate` → `start`
- `endDate` → `end`
- Status values are normalized

#### Companies → Booths
- `company` → `name`
- `website` → `companyPage`
- `logo` → `logoUrl`

## Important Notes

1. **Password Handling**: Old passwords will be re-hashed using bcrypt when saved. If passwords are already hashed, they will be treated as plain text and re-hashed.

2. **ObjectId Preservation**: The script maintains a mapping of old ObjectIds to new ObjectIds to preserve relationships between collections.

3. **Duplicate Handling**: The script checks for existing records (by email for users, by slug for events, etc.) and skips duplicates.

4. **Dependencies**: Migrations run in order respecting dependencies:
   - Users → InterpreterCategories, TermsConditions
   - Events → Companies (Booths)
   - Booths → BoothQueues, VideoCalls
   - BoothQueues → MeetingRecords

5. **Missing Data**: If required fields are missing, the record will be skipped with a log message.

## Troubleshooting

### Common Issues

1. **BSON Reading Errors**: If BSON files are corrupted, the script will skip invalid documents and continue.

2. **Missing Relationships**: If a referenced ObjectId doesn't exist in the new database, the relationship will be set to `null`.

3. **Validation Errors**: If data doesn't match the new schema requirements, the record will be skipped. Check the console output for details.

4. **Connection Issues**: Ensure the MongoDB URI is correct and the database is accessible.

## Rollback

If you need to rollback the migration:

1. Restore from backup:
```bash
mongorestore --uri="mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev" ./backup_before_migration
```

2. Or manually delete migrated collections:
```javascript
// Connect to MongoDB and run:
db.users.deleteMany({});
db.events.deleteMany({});
db.booths.deleteMany({});
// ... etc
```

## Post-Migration Tasks

After successful migration:

1. **Update User Passwords**: Users with temporary passwords (`temp_password_123`) should reset their passwords.

2. **Verify Relationships**: Check that all relationships are properly maintained (e.g., booths linked to events, users assigned to booths).

3. **Update Statistics**: Some statistics may need to be recalculated.

4. **Test Application**: Thoroughly test the application to ensure no code breaks.

## Support

If you encounter issues during migration:
1. Check the console output for specific error messages
2. Verify the old database dump structure matches expected format
3. Ensure all required collections exist in the dump
4. Review the migration logs for skipped records

