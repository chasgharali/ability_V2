const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const BSON = require('bson');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './server/.env' });

// Import all models
const User = require('./server/models/User');
const Event = require('./server/models/Event');
const Booth = require('./server/models/Booth');
const Chat = require('./server/models/Chat');
const Message = require('./server/models/Message');
const Note = require('./server/models/Note');
const MeetingRecord = require('./server/models/MeetingRecord');
const Queue = require('./server/models/Queue');
const BoothQueue = require('./server/models/BoothQueue');
const VideoCall = require('./server/models/VideoCall');
const InterpreterCategory = require('./server/models/InterpreterCategory');
const JobSeekerInterest = require('./server/models/JobSeekerInterest');
const TermsConditions = require('./server/models/TermsConditions');
const Settings = require('./server/models/Settings');

// Configuration
const OLD_DUMP_PATH = path.join(__dirname, 'v1_db_dump', 'Prod_Ability');
const NEW_DB_URI = process.env.MONGODB_URI || 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

// ObjectId mapping for preserving relationships
const idMappings = {
    users: new Map(),
    events: new Map(),
    companies: new Map(), // Will map to booths
    booths: new Map(),
    chats: new Map(),
    rooms: new Map(), // Will map to VideoCall or MeetingRecord
    sessions: new Map(),
    notes: new Map(),
    interpretercategories: new Map(),
    terms: new Map(),
    termsofuses: new Map(),
    privacypolicies: new Map(),
    boothqueues: new Map(),
    meetingrecords: new Map(),
    videocalls: new Map()
};

// Helper function to read BSON file using mongodb's BSON parser
function readBSONFile(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        const documents = [];
        let offset = 0;

        while (offset < data.length - 4) {
            try {
                // Read document size (first 4 bytes)
                const docSize = data.readInt32LE(offset);

                // Validate document size
                if (docSize < 5 || docSize > data.length - offset) {
                    offset += 1;
                    continue;
                }

                // Extract document buffer
                const docBuffer = data.slice(offset, offset + docSize);

                // Deserialize document using BSON.deserialize()
                const doc = BSON.deserialize(docBuffer);
                documents.push(doc);

                // Move to next document
                offset += docSize;
            } catch (err) {
                // Skip invalid bytes and try to find next document
                offset += 1;
                if (offset >= data.length - 4) break;
            }
        }

        return documents;
    } catch (error) {
        console.error(`Error reading BSON file ${filePath}:`, error.message);
        return [];
    }
}

// Migrate Users
async function migrateUsers() {
    console.log('\n=== Migrating Users ===');
    const filePath = path.join(OLD_DUMP_PATH, 'users.bson');
    if (!fs.existsSync(filePath)) {
        console.log('Users.bson not found, skipping...');
        return;
    }

    const oldUsers = readBSONFile(filePath);
    console.log(`Found ${oldUsers.length} users to migrate`);

    let migrated = 0;
    let skipped = 0;

    // Process users in batches to avoid overwhelming the connection
    const batchSize = 50;
    for (let i = 0; i < oldUsers.length; i += batchSize) {
        const batch = oldUsers.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(async (oldUser) => {
            try {
                // Map old user fields to new schema
                const email = (oldUser.email || '').toLowerCase().trim();
                if (!email) {
                    return { status: 'skipped', reason: 'no email' };
                }

                const newUserData = {
                    name: oldUser.name || oldUser.userName || (oldUser.first_name && oldUser.last_name
                        ? `${oldUser.first_name} ${oldUser.last_name}`.trim()
                        : 'Unknown User'),
                    email: email,
                    hashedPassword: oldUser.password || oldUser.hashedPassword || 'temp_password_123',
                    role: mapUserRole(oldUser.role),
                    emailVerified: oldUser.emailVerified || false,
                    emailVerificationToken: oldUser.emailVerificationToken || null,
                    emailVerificationExpires: oldUser.emailVerificationExpires || null,
                    avatarUrl: oldUser.avatarUrl || oldUser.avatar || null,
                    isActive: oldUser.isActive !== false,
                    lastLogin: oldUser.lastLogin || null,
                    resumeUrl: oldUser.resumeUrl || null,
                    phoneNumber: oldUser.phoneNumber || null,
                    state: oldUser.state || '',
                    city: oldUser.city || '',
                    country: oldUser.country || 'US',
                    usesScreenMagnifier: oldUser.usesScreenMagnifier || false,
                    usesScreenReader: oldUser.usesScreenReader || false,
                    needsASL: oldUser.needsASL || false,
                    needsCaptions: oldUser.needsCaptions || false,
                    needsOther: oldUser.needsOther || false,
                    subscribeAnnouncements: oldUser.subscribeAnnouncements || false,
                    languages: oldUser.languages || [],
                    isAvailable: oldUser.isAvailable || false,
                    assignedBooth: null, // Will be set after booths are migrated
                    metadata: oldUser.metadata || {}
                };

                // Handle survey data if exists
                if (oldUser.survey) {
                    newUserData.survey = {
                        race: oldUser.survey.race || [],
                        genderIdentity: oldUser.survey.genderIdentity || '',
                        ageGroup: oldUser.survey.ageGroup || '',
                        countryOfOrigin: oldUser.survey.countryOfOrigin || '',
                        disabilities: oldUser.survey.disabilities || [],
                        otherDisability: oldUser.survey.otherDisability || '',
                        updatedAt: oldUser.survey.updatedAt || null
                    };
                }

                // Check if user already exists using native MongoDB driver (faster, no buffering)
                const db = mongoose.connection.db;
                try {
                    const existingUser = await db.collection('users').findOne(
                        { email: newUserData.email },
                        { projection: { _id: 1 }, maxTimeMS: 5000 }
                    );
                    if (existingUser) {
                        idMappings.users.set(oldUser._id.toString(), existingUser._id.toString());
                        return { status: 'skipped', reason: 'exists' };
                    }
                } catch (checkError) {
                    // If check fails, try to insert anyway (might be network issue)
                    console.log(`Warning: Could not check for existing user ${newUserData.email}, attempting insert...`);
                }

                // Hash password before inserting (since we're bypassing mongoose pre-save hook)
                const bcrypt = require('bcryptjs');
                let hashedPassword = newUserData.hashedPassword;
                if (hashedPassword && hashedPassword !== 'temp_password_123' && !hashedPassword.startsWith('$2')) {
                    // Password is not hashed, hash it
                    const salt = await bcrypt.genSalt(12);
                    hashedPassword = await bcrypt.hash(hashedPassword, salt);
                } else if (hashedPassword === 'temp_password_123') {
                    // Hash the temp password
                    const salt = await bcrypt.genSalt(12);
                    hashedPassword = await bcrypt.hash(hashedPassword, salt);
                }

                // Insert directly using native MongoDB driver (faster, no buffering)
                const result = await db.collection('users').insertOne({
                    ...newUserData,
                    hashedPassword: hashedPassword,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }, { maxTimeMS: 15000 });

                idMappings.users.set(oldUser._id.toString(), result.insertedId.toString());
                return { status: 'migrated' };
            } catch (error) {
                console.error(`Error migrating user ${oldUser._id}:`, error.message);
                return { status: 'error', error: error.message };
            }
        }));

        // Count results
        batchResults.forEach(result => {
            if (result.status === 'fulfilled') {
                if (result.value.status === 'migrated') {
                    migrated++;
                } else {
                    skipped++;
                }
            } else {
                skipped++;
            }
        });

        if ((i + batchSize) % 50 === 0 || (i + batchSize >= oldUsers.length)) {
            console.log(`Progress: ${Math.min(i + batchSize, oldUsers.length)}/${oldUsers.length} users processed (${migrated} migrated, ${skipped} skipped)`);
        }
    }

    console.log(`Users migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Map old user roles to new roles
function mapUserRole(oldRole) {
    const roleMap = {
        'admin': 'Admin',
        'adminevent': 'AdminEvent',
        'boothadmin': 'BoothAdmin',
        'recruiter': 'Recruiter',
        'interpreter': 'Interpreter',
        'globalinterpreter': 'GlobalInterpreter',
        'support': 'Support',
        'globalsupport': 'GlobalSupport',
        'jobseeker': 'JobSeeker',
        'job seeker': 'JobSeeker'
    };

    if (!oldRole) return 'JobSeeker';
    const normalizedRole = oldRole.toLowerCase().trim();
    return roleMap[normalizedRole] || 'JobSeeker';
}

// Migrate Events
async function migrateEvents() {
    console.log('\n=== Migrating Events ===');
    const filePath = path.join(OLD_DUMP_PATH, 'events.bson');
    if (!fs.existsSync(filePath)) {
        console.log('Events.bson not found, skipping...');
        return;
    }

    const oldEvents = readBSONFile(filePath);
    console.log(`Found ${oldEvents.length} events to migrate`);

    const db = mongoose.connection.db;
    let migrated = 0;
    let skipped = 0;

    for (const oldEvent of oldEvents) {
        try {
            // Map old event fields to new schema (use correct old field names)
            const eventName = oldEvent.eventName || oldEvent.name || 'Unnamed Event';
            const slug = oldEvent.slug || generateSlug(eventName);
            const newEventData = {
                name: eventName,
                slug: slug,
                description: oldEvent.description || '',
                link: oldEvent.eventLink || oldEvent.link || null,
                sendyId: oldEvent.sendyId || null,
                logoUrl: oldEvent.logoUrl || oldEvent.logo || null,
                start: oldEvent.eventStartTime || oldEvent.start || oldEvent.startDate || new Date(),
                end: oldEvent.eventEndTime || oldEvent.end || oldEvent.endDate || new Date(Date.now() + 86400000),
                timezone: oldEvent.timezone || 'UTC',
                status: mapEventStatus(oldEvent.status),
                createdBy: mapObjectId(oldEvent.createdBy, 'users'),
                administrators: (oldEvent.administrators || []).map(id => mapObjectId(id, 'users')).filter(Boolean),
                booths: [], // Will be populated after booths are migrated
                termsId: oldEvent.termsId || null,
                termsIds: (oldEvent.termsIds || []).map(id => mapObjectId(id, 'terms')).filter(Boolean),
                limits: {
                    maxBooths: oldEvent.maxBooths || 0,
                    maxRecruitersPerEvent: oldEvent.maxRecruitersPerEvent || 0
                },
                theme: {
                    headerColor: oldEvent.headerColor || '#ffffff',
                    headerTextColor: oldEvent.headerTextColor || '#000000',
                    bodyColor: oldEvent.bodyColor || '#ff9800',
                    bodyTextColor: oldEvent.bodyTextColor || '#000000',
                    sidebarColor: oldEvent.sidebarColor || '#ffffff',
                    sidebarTextColor: oldEvent.sidebarTextColor || '#000000',
                    btnPrimaryColor: oldEvent.btnPrimaryColor || '#000000',
                    btnPrimaryTextColor: oldEvent.btnPrimaryTextColor || '#ffffff',
                    btnSecondaryColor: oldEvent.btnSecondaryColor || '#000000',
                    btnSecondaryTextColor: oldEvent.btnSecondaryTextColor || '#ffffff',
                    entranceFormColor: oldEvent.entranceFormColor || '#ff9800',
                    entranceFormTextColor: oldEvent.entranceFormTextColor || '#000000',
                    chatHeaderColor: oldEvent.chatHeaderColor || '#eeeeee',
                    chatSidebarColor: oldEvent.chatSidebarColor || '#000000',
                    addFooter: oldEvent.addFooter || false
                },
                settings: oldEvent.settings || {},
                stats: oldEvent.stats || {
                    totalRegistrations: 0,
                    totalCalls: 0,
                    totalInterpreterRequests: 0
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Check if event already exists using native MongoDB driver
            const existingEvent = await db.collection('events').findOne(
                { slug: slug },
                { projection: { _id: 1 }, maxTimeMS: 5000 }
            );
            if (existingEvent) {
                console.log(`Event ${slug} already exists, skipping...`);
                idMappings.events.set(oldEvent._id.toString(), existingEvent._id.toString());
                skipped++;
                continue;
            }

            // Insert directly using native MongoDB driver
            const result = await db.collection('events').insertOne(newEventData, { maxTimeMS: 15000 });

            idMappings.events.set(oldEvent._id.toString(), result.insertedId.toString());
            migrated++;

            if (migrated % 5 === 0) {
                console.log(`Migrated ${migrated} events...`);
            }
        } catch (error) {
            console.error(`Error migrating event ${oldEvent._id}:`, error.message);
        }
    }

    console.log(`Events migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Companies (to Booths)
async function migrateCompanies() {
    console.log('\n=== Migrating Companies to Booths ===');
    const filePath = path.join(OLD_DUMP_PATH, 'companies.bson');
    if (!fs.existsSync(filePath)) {
        console.log('Companies.bson not found, skipping...');
        return;
    }

    const oldCompanies = readBSONFile(filePath);
    console.log(`Found ${oldCompanies.length} companies to migrate`);

    const db = mongoose.connection.db;
    let migrated = 0;
    let skipped = 0;

    for (const oldCompany of oldCompanies) {
        try {
            // Map old company fields to new booth schema (use correct old field names)
            const eventId = mapObjectId(oldCompany.eventId || oldCompany.event || oldCompany.eventID, 'events');
            const name = oldCompany.companyName || oldCompany.name || oldCompany.company || 'Unnamed Booth';

            if (!eventId) {
                console.log(`Skipping booth ${oldCompany._id}: no valid eventId`);
                skipped++;
                continue;
            }

            // Handle customInviteSlug - check for duplicates and modify if needed
            let customInviteSlug = oldCompany.customUrl || oldCompany.customInviteSlug || oldCompany.slug || null;
            
            // Ensure slug is unique by appending random string if it looks generic (like a date)
            if (customInviteSlug && /^\d+$/.test(customInviteSlug)) {
                 customInviteSlug = `${customInviteSlug}-${oldCompany._id.toString().slice(-6)}`;
            }

            if (customInviteSlug) {
                const existingSlug = await db.collection('booths').findOne(
                    { customInviteSlug: customInviteSlug },
                    { projection: { _id: 1 }, maxTimeMS: 5000 }
                );
                if (existingSlug) {
                    // Make slug unique by appending booth ID
                    customInviteSlug = `${customInviteSlug}-${oldCompany._id.toString().slice(-6)}`;
                    console.log(`  Modified duplicate slug to: ${customInviteSlug}`);
                }
            }
            
            const newBoothData = {
                eventId: eventId,
                name: name,
                description: oldCompany.description || oldCompany.companyDescription || '',
                companyPage: oldCompany.companyPage || oldCompany.website || oldCompany.companyWebsite || '',
                logoUrl: oldCompany.companyLogo || oldCompany.logoUrl || oldCompany.logo || null,
                customInviteSlug: customInviteSlug,
                expireLinkTime: oldCompany.expiryDate || oldCompany.expireLinkTime || null,
                recruitersCount: oldCompany.recruitersCount || oldCompany.interviewLimit || 1,
                administrators: (oldCompany.administrators || []).map(id => mapObjectId(id, 'users')).filter(Boolean),
                status: oldCompany.status === 'inactive' ? 'inactive' : 'active',
                settings: oldCompany.settings || {},
                stats: oldCompany.stats || {
                    totalQueueJoins: 0,
                    totalCalls: 0,
                    averageCallDuration: 0,
                    averageRating: 0
                },
                richSections: oldCompany.richSections || [],
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Check if booth already exists using native MongoDB driver
            const existingBooth = await db.collection('booths').findOne(
                {
                    eventId: eventId,
                    name: name
                },
                { projection: { _id: 1 }, maxTimeMS: 5000 }
            );
            if (existingBooth) {
                console.log(`Booth ${name} already exists, skipping...`);
                idMappings.companies.set(oldCompany._id.toString(), existingBooth._id.toString());
                idMappings.booths.set(oldCompany._id.toString(), existingBooth._id.toString());
                skipped++;
                continue;
            }

            // Insert directly using native MongoDB driver
            const result = await db.collection('booths').insertOne(newBoothData, { maxTimeMS: 15000 });
            const newBoothId = result.insertedId;

            idMappings.companies.set(oldCompany._id.toString(), newBoothId.toString());
            idMappings.booths.set(oldCompany._id.toString(), newBoothId.toString());
            migrated++;

            // Update event's booths array using native MongoDB driver
            await db.collection('events').updateOne(
                { _id: eventId },
                { $addToSet: { booths: newBoothId } },
                { maxTimeMS: 10000 }
            );

            if (migrated % 5 === 0) {
                console.log(`Migrated ${migrated} booths...`);
            }
        } catch (error) {
            console.error(`Error migrating company ${oldCompany._id}:`, error.message);
        }
    }

    console.log(`Booths migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Chats
async function migrateChats() {
    console.log('\n=== Migrating Chats ===');
    const filePath = path.join(OLD_DUMP_PATH, 'chats.bson');
    if (!fs.existsSync(filePath)) {
        console.log('Chats.bson not found, skipping...');
        return;
    }

    const oldChats = readBSONFile(filePath);
    console.log(`Found ${oldChats.length} chats to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const oldChat of oldChats) {
        try {
            const newChatData = {
                name: oldChat.name || 'Chat',
                type: oldChat.type || 'direct',
                participants: (oldChat.participants || []).map(p => ({
                    user: mapObjectId(p.user || p.userId, 'users'),
                    role: p.role || 'JobSeeker',
                    joinedAt: p.joinedAt || new Date(),
                    lastRead: p.lastRead || new Date()
                })).filter(p => p.user),
                booth: mapObjectId(oldChat.booth, 'booths'),
                event: mapObjectId(oldChat.event || oldChat.eventId, 'events'),
                lastMessage: oldChat.lastMessage ? {
                    content: oldChat.lastMessage.content || '',
                    sender: mapObjectId(oldChat.lastMessage.sender, 'users'),
                    timestamp: oldChat.lastMessage.timestamp || new Date()
                } : undefined,
                isActive: oldChat.isActive !== false,
                metadata: oldChat.metadata || {}
            };

            if (!newChatData.participants || newChatData.participants.length === 0) {
                skipped++;
                continue;
            }

            const newChat = new Chat(newChatData);
            await newChat.save();

            idMappings.chats.set(oldChat._id.toString(), newChat._id.toString());
            migrated++;

            if (migrated % 10 === 0) {
                console.log(`Migrated ${migrated} chats...`);
            }
        } catch (error) {
            console.error(`Error migrating chat ${oldChat._id}:`, error.message);
        }
    }

    console.log(`Chats migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Notes
async function migrateNotes() {
    console.log('\n=== Migrating Notes ===');
    const filePath = path.join(OLD_DUMP_PATH, 'notes.bson');
    if (!fs.existsSync(filePath)) {
        console.log('Notes.bson not found, skipping...');
        return;
    }
    
    const oldNotes = readBSONFile(filePath);
    console.log(`Found ${oldNotes.length} notes to migrate`);
    
    const db = mongoose.connection.db;
    let migrated = 0;
    let skipped = 0;
    
    for (const oldNote of oldNotes) {
        try {
            const createdBy = mapObjectId(oldNote.createdBy, 'users');
            const updatedBy = mapObjectId(oldNote.updatedBy || oldNote.createdBy, 'users');
            
            if (!createdBy) {
                skipped++;
                continue;
            }
            
            const newNoteData = {
                title: oldNote.title || 'Untitled Note',
                content: oldNote.content || '',
                type: oldNote.type || 'instruction',
                assignedRoles: oldNote.assignedRoles || ['JobSeeker'],
                createdBy: createdBy,
                updatedBy: updatedBy || createdBy,
                isActive: oldNote.isActive !== false,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            // Insert directly using native MongoDB driver
            const result = await db.collection('notes').insertOne(newNoteData, { maxTimeMS: 15000 });
            
            idMappings.notes.set(oldNote._id.toString(), result.insertedId.toString());
            migrated++;
            
            if (migrated % 10 === 0) {
                console.log(`Migrated ${migrated} notes...`);
            }
        } catch (error) {
            console.error(`Error migrating note ${oldNote._id}:`, error.message);
        }
    }
    
    console.log(`Notes migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Interpreter Categories
async function migrateInterpreterCategories() {
    console.log('\n=== Migrating Interpreter Categories ===');
    const filePath = path.join(OLD_DUMP_PATH, 'interpretercategories.bson');
    if (!fs.existsSync(filePath)) {
        console.log('InterpreterCategories.bson not found, skipping...');
        return;
    }

    const oldCategories = readBSONFile(filePath);
    console.log(`Found ${oldCategories.length} categories to migrate`);

    const db = mongoose.connection.db;
    let migrated = 0;
    let skipped = 0;

    for (const oldCat of oldCategories) {
        try {
            const code = oldCat.code || generateCode(oldCat.name || 'CATEGORY');
            const createdBy = mapObjectId(oldCat.createdBy, 'users') || await getAdminUserId();

            if (!createdBy) {
                skipped++;
                continue;
            }

            const newCatData = {
                name: oldCat.name || 'Unnamed Category',
                description: oldCat.description || '',
                code: code,
                isActive: oldCat.isActive !== false,
                color: oldCat.color || '#000000',
                sortOrder: oldCat.sortOrder || 0,
                createdBy: createdBy,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Check if category already exists using native MongoDB driver
            const existing = await db.collection('interpretercategories').findOne(
                { code: code },
                { projection: { _id: 1 }, maxTimeMS: 5000 }
            );
            if (existing) {
                idMappings.interpretercategories.set(oldCat._id.toString(), existing._id.toString());
                skipped++;
                continue;
            }

            // Insert directly using native MongoDB driver
            const result = await db.collection('interpretercategories').insertOne(newCatData, { maxTimeMS: 15000 });

            idMappings.interpretercategories.set(oldCat._id.toString(), result.insertedId.toString());
            migrated++;
        } catch (error) {
            console.error(`Error migrating category ${oldCat._id}:`, error.message);
        }
    }

    console.log(`Interpreter Categories migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Terms & Conditions
async function migrateTermsConditions() {
    console.log('\n=== Migrating Terms & Conditions ===');
    const termsFiles = [
        { path: path.join(OLD_DUMP_PATH, 'terms.bson'), name: 'terms' },
        { path: path.join(OLD_DUMP_PATH, 'termsofuses.bson'), name: 'termsofuses' },
        { path: path.join(OLD_DUMP_PATH, 'privacypolicies.bson'), name: 'privacypolicies' }
    ];

    const db = mongoose.connection.db;
    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const fileInfo of termsFiles) {
        if (!fs.existsSync(fileInfo.path)) {
            console.log(`${fileInfo.name}.bson not found, skipping...`);
            continue;
        }

        const oldTerms = readBSONFile(fileInfo.path);
        console.log(`Found ${oldTerms.length} ${fileInfo.name} to migrate`);

        for (const oldTerm of oldTerms) {
            try {
                const createdBy = mapObjectId(oldTerm.createdBy, 'users') || await getAdminUserId();
                const updatedBy = mapObjectId(oldTerm.updatedBy || oldTerm.createdBy, 'users') || await getAdminUserId();

                if (!createdBy || !updatedBy) {
                    totalSkipped++;
                    continue;
                }

                const newTermData = {
                    title: oldTerm.title || 'Terms & Conditions',
                    content: oldTerm.content || oldTerm.text || '',
                    version: oldTerm.version || '1.0',
                    isActive: oldTerm.isActive !== false,
                    isRequired: oldTerm.isRequired !== false,
                    createdBy: createdBy,
                    updatedBy: updatedBy,
                    usage: oldTerm.usage || {
                        totalEvents: 0,
                        lastUsed: null
                    },
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                // Insert directly using native MongoDB driver
                const result = await db.collection('termsconditions').insertOne(newTermData, { maxTimeMS: 15000 });

                idMappings.terms.set(oldTerm._id.toString(), result.insertedId.toString());
                idMappings.termsofuses.set(oldTerm._id.toString(), result.insertedId.toString());
                idMappings.privacypolicies.set(oldTerm._id.toString(), result.insertedId.toString());
                totalMigrated++;
            } catch (error) {
                console.error(`Error migrating term ${oldTerm._id}:`, error.message);
            }
        }
    }

    console.log(`Terms & Conditions migration complete: ${totalMigrated} migrated, ${totalSkipped} skipped`);
}

// Migrate Booth Queues (from jobseekereventlogs or jobseekerqueuevisits)
async function migrateBoothQueues() {
    console.log('\n=== Migrating Booth Queues ===');
    const filePath = path.join(OLD_DUMP_PATH, 'jobseekerqueuevisits.bson');
    if (!fs.existsSync(filePath)) {
        console.log('JobSeekerQueueVisits.bson not found, skipping...');
        return;
    }

    const oldQueues = readBSONFile(filePath);
    console.log(`Found ${oldQueues.length} queue entries to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const oldQueue of oldQueues) {
        try {
            const boothId = mapObjectId(oldQueue.boothId || oldQueue.booth || oldQueue.companyId, 'booths');
            const eventId = mapObjectId(oldQueue.eventId || oldQueue.event, 'events');
            const jobSeekerId = mapObjectId(oldQueue.jobSeekerId || oldQueue.jobSeeker || oldQueue.userId, 'users');

            if (!boothId || !eventId || !jobSeekerId) {
                skipped++;
                continue;
            }

            // Get next position for this booth (using lean for faster query)
            const lastEntry = await BoothQueue.findOne({ booth: boothId })
                .sort({ position: -1 })
                .select('position')
                .lean();
            const nextPosition = lastEntry ? lastEntry.position + 1 : 1;

            const newQueueData = {
                jobSeeker: jobSeekerId,
                booth: boothId,
                event: eventId,
                position: oldQueue.position || nextPosition,
                queueToken: oldQueue.queueToken || `${boothId}_${jobSeekerId}_${Date.now()}`,
                interpreterCategory: mapObjectId(oldQueue.interpreterCategory, 'interpretercategories'),
                status: mapQueueStatus(oldQueue.status),
                joinedAt: oldQueue.joinedAt || oldQueue.createdAt || new Date(),
                leftAt: oldQueue.leftAt || null,
                invitedAt: oldQueue.invitedAt || null,
                lastActivity: oldQueue.lastActivity || new Date(),
                messages: oldQueue.messages || [],
                leaveMessage: oldQueue.leaveMessage || null
            };

            // Check if queue entry already exists (using lean for faster query)
            const existing = await BoothQueue.findOne({
                jobSeeker: jobSeekerId,
                booth: boothId,
                status: { $in: ['waiting', 'invited', 'in_meeting'] }
            }).lean();

            if (existing) {
                skipped++;
                continue;
            }

            const newQueue = new BoothQueue(newQueueData);
            await newQueue.save();

            migrated++;

            if (migrated % 10 === 0) {
                console.log(`Migrated ${migrated} queue entries...`);
            }
        } catch (error) {
            console.error(`Error migrating queue entry ${oldQueue._id}:`, error.message);
        }
    }

    console.log(`Booth Queues migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Rooms (to VideoCall)
async function migrateRooms() {
    console.log('\n=== Migrating Rooms to VideoCalls ===');
    const filePath = path.join(OLD_DUMP_PATH, 'rooms.bson');
    if (!fs.existsSync(filePath)) {
        console.log('Rooms.bson not found, skipping...');
        return;
    }

    const oldRooms = readBSONFile(filePath);
    console.log(`Found ${oldRooms.length} rooms to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const oldRoom of oldRooms) {
        try {
            const boothId = mapObjectId(oldRoom.boothId || oldRoom.booth, 'booths');
            const eventId = mapObjectId(oldRoom.eventId || oldRoom.event, 'events');
            const recruiterId = mapObjectId(oldRoom.recruiterId || oldRoom.recruiter, 'users');
            const jobSeekerId = mapObjectId(oldRoom.jobSeekerId || oldRoom.jobSeeker, 'users');
            const queueEntryId = mapObjectId(oldRoom.queueEntryId || oldRoom.queueEntry, 'boothqueues');

            if (!boothId || !eventId || !recruiterId || !jobSeekerId) {
                skipped++;
                continue;
            }

            const newVideoCallData = {
                roomName: oldRoom.roomName || oldRoom.name || `room_${oldRoom._id}`,
                roomSid: oldRoom.roomSid || oldRoom.sid || '',
                event: eventId,
                booth: boothId,
                recruiter: recruiterId,
                jobSeeker: jobSeekerId,
                queueEntry: queueEntryId || (await BoothQueue.findOne({ jobSeeker: jobSeekerId, booth: boothId })?._id),
                interpreters: (oldRoom.interpreters || []).map(i => ({
                    interpreter: mapObjectId(i.interpreter || i.userId, 'users'),
                    category: i.category || '',
                    status: i.status || 'invited',
                    invitedAt: i.invitedAt || new Date(),
                    joinedAt: i.joinedAt || null
                })).filter(i => i.interpreter),
                status: mapVideoCallStatus(oldRoom.status),
                startedAt: oldRoom.startedAt || oldRoom.createdAt || new Date(),
                endedAt: oldRoom.endedAt || null,
                duration: oldRoom.duration || null,
                participants: (oldRoom.participants || []).map(p => ({
                    user: mapObjectId(p.user || p.userId, 'users'),
                    role: p.role || 'jobseeker',
                    participantSid: p.participantSid || '',
                    joinedAt: p.joinedAt || new Date(),
                    leftAt: p.leftAt || null,
                    connectionQuality: p.connectionQuality || 'good'
                })).filter(p => p.user),
                chatMessages: (oldRoom.chatMessages || []).map(m => ({
                    sender: mapObjectId(m.sender || m.userId, 'users'),
                    senderRole: m.senderRole || 'jobseeker',
                    message: m.message || m.content || '',
                    timestamp: m.timestamp || new Date(),
                    messageType: m.messageType || 'text'
                })).filter(m => m.sender),
                callQuality: oldRoom.callQuality || {},
                metadata: oldRoom.metadata || {}
            };

            // Check if video call already exists (using lean for faster query)
            const existing = await VideoCall.findOne({ roomName: newVideoCallData.roomName }).lean();
            if (existing) {
                idMappings.rooms.set(oldRoom._id.toString(), existing._id.toString());
                skipped++;
                continue;
            }

            const newVideoCall = new VideoCall(newVideoCallData);
            await newVideoCall.save();

            idMappings.rooms.set(oldRoom._id.toString(), newVideoCall._id.toString());
            migrated++;

            if (migrated % 10 === 0) {
                console.log(`Migrated ${migrated} video calls...`);
            }
        } catch (error) {
            console.error(`Error migrating room ${oldRoom._id}:`, error.message);
        }
    }

    console.log(`Rooms migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Meeting Datas (to MeetingRecord)
async function migrateMeetingDatas() {
    console.log('\n=== Migrating Meeting Datas to Meeting Records ===');
    const filePath = path.join(OLD_DUMP_PATH, 'meetingdatas.bson');
    if (!fs.existsSync(filePath)) {
        console.log('MeetingDatas.bson not found, skipping...');
        return;
    }

    const oldMeetings = readBSONFile(filePath);
    console.log(`Found ${oldMeetings.length} meetings to migrate`);

    const db = mongoose.connection.db;
    let migrated = 0;
    let skipped = 0;

    for (const oldMeeting of oldMeetings) {
        try {
            // Map old field names to new schema - try ID mapping first, then lookup by name/slug
            let eventId = mapObjectId(oldMeeting.eventId || oldMeeting.event, 'events');
            if (!eventId && oldMeeting.eventName) {
                // Fallback: lookup by event name/slug
                const event = await db.collection('events').findOne(
                    { $or: [{ name: oldMeeting.eventName }, { slug: oldMeeting.eventName?.toLowerCase().replace(/\s+/g, '-') }] },
                    { projection: { _id: 1 }, maxTimeMS: 5000 }
                );
                if (event) {
                    eventId = event._id.toString();
                    // Store mapping for future lookups
                    if (oldMeeting.eventId) {
                        idMappings.events.set(oldMeeting.eventId.toString(), eventId);
                    }
                }
            }
            
            // Old schema uses companyId, which maps to booths but stored in companies mapping
            let boothId = mapObjectId(oldMeeting.companyId || oldMeeting.boothId || oldMeeting.booth, 'companies') || 
                         mapObjectId(oldMeeting.companyId || oldMeeting.boothId || oldMeeting.booth, 'booths');
            if (!boothId && oldMeeting.companyName) {
                // Fallback: lookup by booth name
                const booth = await db.collection('booths').findOne(
                    { name: oldMeeting.companyName },
                    { projection: { _id: 1 }, maxTimeMS: 5000 }
                );
                if (booth) {
                    boothId = booth._id.toString();
                    // Store mapping for future lookups
                    if (oldMeeting.companyId) {
                        idMappings.companies.set(oldMeeting.companyId.toString(), boothId);
                        idMappings.booths.set(oldMeeting.companyId.toString(), boothId);
                    }
                }
            }
            
            const recruiterId = mapObjectId(oldMeeting.interviewerId || oldMeeting.recruiterId || oldMeeting.recruiter, 'users');
            
            // Find job seeker by email or name if ID not available
            let jobseekerId = mapObjectId(oldMeeting.jobSeekerId || oldMeeting.jobseekerId || oldMeeting.jobSeeker || oldMeeting.jobseeker, 'users');
            if (!jobseekerId && oldMeeting.jobSeekerEmail) {
                const jobSeeker = await db.collection('users').findOne(
                    { email: oldMeeting.jobSeekerEmail },
                    { projection: { _id: 1 }, maxTimeMS: 5000 }
                );
                if (jobSeeker) {
                    jobseekerId = jobSeeker._id.toString();
                }
            }

            if (!eventId || !boothId || !recruiterId || !jobseekerId) {
                if (!eventId) console.log(`  Skipping meeting ${oldMeeting._id}: no eventId (old: ${oldMeeting.eventId})`);
                if (!boothId) console.log(`  Skipping meeting ${oldMeeting._id}: no boothId (old: ${oldMeeting.companyId})`);
                if (!recruiterId) console.log(`  Skipping meeting ${oldMeeting._id}: no recruiterId (old: ${oldMeeting.interviewerId})`);
                if (!jobseekerId) console.log(`  Skipping meeting ${oldMeeting._id}: no jobseekerId`);
                skipped++;
                continue;
            }

            // Find or create queue entry if missing
            let finalQueueId = mapObjectId(oldMeeting.queueId || oldMeeting.queueEntry, 'boothqueues');
            if (!finalQueueId) {
                const queueEntry = await db.collection('boothqueues').findOne(
                    { jobSeeker: new mongoose.Types.ObjectId(jobseekerId), booth: new mongoose.Types.ObjectId(boothId) },
                    { projection: { _id: 1 }, maxTimeMS: 5000 }
                );
                if (queueEntry) {
                    finalQueueId = queueEntry._id;
                } else {
                    // Create a minimal queue entry if none exists
                    const newQueueData = {
                        jobSeeker: new mongoose.Types.ObjectId(jobseekerId),
                        booth: new mongoose.Types.ObjectId(boothId),
                        event: new mongoose.Types.ObjectId(eventId),
                        position: 1,
                        queueToken: `migrated_${oldMeeting._id}`,
                        status: 'completed',
                        joinedAt: oldMeeting.meetingStartTime || oldMeeting.createdAt || new Date(),
                        leftAt: oldMeeting.meetingEndTime || oldMeeting.endedAt || null,
                        lastActivity: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    const queueResult = await db.collection('boothqueues').insertOne(newQueueData, { maxTimeMS: 15000 });
                    finalQueueId = queueResult.insertedId;
                }
            }

            const videoCallId = mapObjectId(oldMeeting.videoCallId || oldMeeting.roomId, 'rooms');
            const interpreterId = mapObjectId(oldMeeting.interpreterId || oldMeeting.interpreter, 'users');
            
            // Map meeting status - old schema uses meetingStatus, map active/ended to completed
            let status = mapMeetingStatus(oldMeeting.meetingStatus || oldMeeting.status);
            if (status === 'active' || oldMeeting.meetingStatus === 'ended' || oldMeeting.meetingStatus === 'active') {
                status = 'completed';
            }

            // Calculate duration in minutes
            let duration = oldMeeting.meetingDuration || null;
            if (!duration && oldMeeting.meetingStartTime && oldMeeting.meetingEndTime) {
                const start = new Date(oldMeeting.meetingStartTime);
                const end = new Date(oldMeeting.meetingEndTime);
                duration = Math.floor((end - start) / (1000 * 60)); // Convert to minutes
            }

            const newMeetingData = {
                eventId: new mongoose.Types.ObjectId(eventId),
                boothId: new mongoose.Types.ObjectId(boothId),
                queueId: finalQueueId,
                videoCallId: videoCallId ? new mongoose.Types.ObjectId(videoCallId) : null,
                recruiterId: new mongoose.Types.ObjectId(recruiterId),
                jobseekerId: new mongoose.Types.ObjectId(jobseekerId),
                interpreterId: interpreterId ? new mongoose.Types.ObjectId(interpreterId) : null,
                twilioRoomId: oldMeeting.roomId || oldMeeting.twilioRoomId || oldMeeting.roomName || null,
                twilioRoomSid: oldMeeting.twilioRoomSid || oldMeeting.roomSid || null,
                startTime: oldMeeting.meetingStartTime || oldMeeting.startTime || oldMeeting.startedAt || oldMeeting.createdAt || new Date(),
                endTime: oldMeeting.meetingEndTime || oldMeeting.endTime || oldMeeting.endedAt || null,
                duration: duration,
                status: status,
                qualityMetrics: oldMeeting.qualityMetrics || {},
                feedback: oldMeeting.feedback || null,
                recruiterRating: oldMeeting.recruiterRating || null,
                recruiterFeedback: oldMeeting.recruiterFeedback || null,
                jobSeekerMessages: oldMeeting.jobSeekerMessages || [],
                attachments: oldMeeting.attachments || [],
                chatMessages: (oldMeeting.chatMessages || []).map(m => {
                    const userId = mapObjectId(m.userId || m.sender, 'users');
                    if (!userId) return null;
                    return {
                        userId: new mongoose.Types.ObjectId(userId),
                        message: m.message || m.content || '',
                        timestamp: m.timestamp || new Date(),
                        messageType: m.messageType || 'text',
                        attachment: m.attachment || null
                    };
                }).filter(m => m !== null),
                interpreterRequest: oldMeeting.interpreterRequest || null,
                metadata: oldMeeting.metadata || {},
                createdAt: oldMeeting.createdAt || new Date(),
                updatedAt: oldMeeting.updatedAt || new Date()
            };

            // Insert using native MongoDB driver
            const result = await db.collection('meetingrecords').insertOne(newMeetingData, { maxTimeMS: 15000 });

            // Update queue entry with meeting ID
            if (finalQueueId) {
                await db.collection('boothqueues').updateOne(
                    { _id: finalQueueId },
                    { $set: { meetingId: result.insertedId, status: 'completed' } },
                    { maxTimeMS: 15000 }
                );
            }

            idMappings.meetingrecords.set(oldMeeting._id.toString(), result.insertedId.toString());
            migrated++;

            if (migrated % 10 === 0) {
                console.log(`Migrated ${migrated} meeting records...`);
            }
        } catch (error) {
            console.error(`Error migrating meeting ${oldMeeting._id}:`, error.message);
        }
    }

    console.log(`Meeting Records migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Event Interests (to JobSeekerInterest)
async function migrateEventInterests() {
    console.log('\n=== Migrating Event Interests ===');
    const filePath = path.join(OLD_DUMP_PATH, 'eventinterests.bson');
    if (!fs.existsSync(filePath)) {
        console.log('EventInterests.bson not found, skipping...');
        return;
    }

    const oldInterests = readBSONFile(filePath);
    console.log(`Found ${oldInterests.length} interests to migrate`);

    const db = mongoose.connection.db;
    let migrated = 0;
    let skipped = 0;

    for (const oldInterest of oldInterests) {
        try {
            // Map old field names - old schema uses userId and interestedInCompanies array
            let jobSeekerId = mapObjectId(oldInterest.userId || oldInterest.jobSeekerId || oldInterest.jobSeeker, 'users');
            let eventId = mapObjectId(oldInterest.eventId || oldInterest.event, 'events');
            
            // Fallback lookup for event if ID mapping fails (might be already migrated with different ID)
            if (!eventId && oldInterest.eventId) {
                // Try to find by any matching field - events are already migrated
                // We'll skip if event not found since it's required
            }

            if (!jobSeekerId || !eventId) {
                if (!jobSeekerId) console.log(`  Skipping interest ${oldInterest._id}: no jobSeekerId (old: ${oldInterest.userId})`);
                if (!eventId) console.log(`  Skipping interest ${oldInterest._id}: no eventId (old: ${oldInterest.eventId})`);
                skipped++;
                continue;
            }

            // Old schema might have interestedInCompanies array OR single companyId field
            let companyIds = [];
            
            // Check if it's an array
            if (Array.isArray(oldInterest.interestedInCompanies)) {
                companyIds = oldInterest.interestedInCompanies;
            } 
            // Check if it's a single companyId field
            else if (oldInterest.companyId || oldInterest.boothId) {
                companyIds = [oldInterest.companyId || oldInterest.boothId];
            }
            // Check if it's a string that needs to be parsed
            else if (typeof oldInterest.interestedInCompanies === 'string') {
                try {
                    companyIds = JSON.parse(oldInterest.interestedInCompanies);
                } catch {
                    companyIds = [oldInterest.interestedInCompanies];
                }
            }

            if (companyIds.length === 0) {
                skipped++;
                continue;
            }

            for (const companyIdStr of companyIds) {
                try {
                    if (!companyIdStr) continue;
                    
                    // Old schema uses companyId, which maps to booths but stored in companies mapping
                    let boothId = mapObjectId(companyIdStr.toString(), 'companies') || mapObjectId(companyIdStr.toString(), 'booths');
                    
                    // If mapping fails, try to find booth by name or other fields
                    if (!boothId && oldInterest.companyName) {
                        const booth = await db.collection('booths').findOne(
                            { name: oldInterest.companyName },
                            { projection: { _id: 1 }, maxTimeMS: 5000 }
                        );
                        if (booth) {
                            boothId = booth._id.toString();
                        }
                    }
                    
                    if (!boothId) {
                        continue;
                    }

                    // Get booth info for company name using native driver
                    const booth = await db.collection('booths').findOne(
                        { _id: new mongoose.Types.ObjectId(boothId) },
                        { projection: { name: 1, logoUrl: 1 }, maxTimeMS: 5000 }
                    );
                    
                    const companyName = booth?.name || oldInterest.companyName || 'Unknown Company';
                    const companyLogo = booth?.logoUrl || oldInterest.companyLogo || null;

                    // Check if interest already exists
                    const existing = await db.collection('jobseekerinterests').findOne(
                        {
                            jobSeeker: new mongoose.Types.ObjectId(jobSeekerId),
                            event: new mongoose.Types.ObjectId(eventId),
                            booth: new mongoose.Types.ObjectId(boothId)
                        },
                        { projection: { _id: 1 }, maxTimeMS: 5000 }
                    );

                    if (existing) {
                        continue;
                    }

                    const newInterestData = {
                        jobSeeker: new mongoose.Types.ObjectId(jobSeekerId),
                        event: new mongoose.Types.ObjectId(eventId),
                        booth: new mongoose.Types.ObjectId(boothId),
                        company: companyName,
                        companyLogo: companyLogo,
                        isInterested: oldInterest.isInterested !== false,
                        interestLevel: oldInterest.interestLevel || 'medium',
                        notes: oldInterest.notes || null,
                        createdAt: oldInterest.createdAt || new Date(),
                        updatedAt: oldInterest.updatedAt || new Date()
                    };

                    // Insert using native MongoDB driver
                    await db.collection('jobseekerinterests').insertOne(newInterestData, { maxTimeMS: 15000 });

                    migrated++;

                    if (migrated % 50 === 0) {
                        console.log(`Migrated ${migrated} interests...`);
                    }
                } catch (error) {
                    if (error.code === 11000) {
                        // Duplicate key error - already exists, skip
                        continue;
                    }
                    console.error(`Error migrating interest for company ${companyIdStr}:`, error.message);
                }
            }
        } catch (error) {
            console.error(`Error migrating interest ${oldInterest._id}:`, error.message);
        }
    }

    console.log(`Event Interests migration complete: ${migrated} migrated, ${skipped} skipped`);
}

// Migrate Messages
async function migrateMessages() {
    console.log('\n=== Migrating Messages ===');
    // Check if there's a separate messages collection
    // Messages might be embedded in chats, so this might not be needed
    const filePath = path.join(OLD_DUMP_PATH, 'chats.bson');
    if (!fs.existsSync(filePath)) {
        console.log('No separate messages collection found, skipping...');
        return;
    }

    // Messages are typically embedded in chats or handled separately
    // This would need to be implemented based on the old schema
    console.log('Messages migration skipped - messages are typically embedded in chats');
}

// Update user assignedBooth references
async function updateUserBoothAssignments() {
    console.log('\n=== Updating User Booth Assignments ===');

    // This would need to be implemented based on how booths were assigned in the old system
    // For now, we'll skip this as it depends on the old schema structure
    console.log('User booth assignments update skipped - implement based on old schema');
}

// Helper function to get admin user ID using native MongoDB
async function getAdminUserId() {
    try {
        const db = mongoose.connection.db;
        const adminUser = await db.collection('users').findOne(
            { role: 'Admin' },
            { projection: { _id: 1 }, maxTimeMS: 5000 }
        );
        return adminUser ? adminUser._id : null;
    } catch (error) {
        return null;
    }
}

// Helper functions
function mapObjectId(oldId, collection) {
    if (!oldId) return null;
    const oldIdStr = oldId.toString ? oldId.toString() : oldId;

    // Handle different collection name mappings
    const collectionMap = {
        'boothqueues': 'boothqueues',
        'booths': collection === 'booths' ? 'booths' : (collection === 'companies' ? 'companies' : 'booths'),
        'companies': 'companies',
        'rooms': 'rooms',
        'videocalls': 'rooms', // Rooms map to videocalls
        'meetingrecords': 'meetingrecords'
    };

    const mappedCollection = collectionMap[collection] || collection;
    const mapping = idMappings[mappedCollection]?.get(oldIdStr);
    return mapping ? new mongoose.Types.ObjectId(mapping) : null;
}

function generateSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim('-');
}

function generateCode(name) {
    return name
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 10);
}

function mapEventStatus(oldStatus) {
    const statusMap = {
        'draft': 'draft',
        'published': 'published',
        'active': 'active',
        'completed': 'completed',
        'cancelled': 'cancelled'
    };
    return statusMap[oldStatus?.toLowerCase()] || 'draft';
}

function mapQueueStatus(oldStatus) {
    const statusMap = {
        'waiting': 'waiting',
        'invited': 'invited',
        'in_meeting': 'in_meeting',
        'in-meeting': 'in_meeting',
        'completed': 'completed',
        'left': 'left',
        'left_with_message': 'left_with_message',
        'left-with-message': 'left_with_message'
    };
    return statusMap[oldStatus?.toLowerCase()] || 'waiting';
}

function mapVideoCallStatus(oldStatus) {
    const statusMap = {
        'active': 'active',
        'ended': 'ended',
        'failed': 'failed',
        'completed': 'ended'
    };
    return statusMap[oldStatus?.toLowerCase()] || 'active';
}

function mapMeetingStatus(oldStatus) {
    const statusMap = {
        'scheduled': 'scheduled',
        'active': 'active',
        'completed': 'completed',
        'cancelled': 'cancelled',
        'failed': 'failed',
        'left_with_message': 'left_with_message',
        'left-with-message': 'left_with_message'
    };
    return statusMap[oldStatus?.toLowerCase()] || 'scheduled';
}

// Main migration function
async function runMigration() {
    try {
        console.log('Connecting to new database...');

        // Set mongoose options before connecting
        mongoose.set('bufferCommands', false); // Disable command buffering

        await mongoose.connect(NEW_DB_URI, {
            serverSelectionTimeoutMS: 30000, // 30 seconds
            socketTimeoutMS: 45000, // 45 seconds
            maxPoolSize: 10,
            minPoolSize: 1,
            connectTimeoutMS: 30000
        });

        // Wait for connection to be ready and verify
        await mongoose.connection.db.admin().ping();

        // Ensure connection is ready by waiting for readyState
        let retries = 0;
        while (mongoose.connection.readyState !== 1 && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 500));
            retries++;
        }

        if (mongoose.connection.readyState !== 1) {
            throw new Error('MongoDB connection not ready after retries');
        }

        console.log('Connected to database successfully!');
        console.log('Database:', mongoose.connection.db.databaseName);
        console.log('Ready state:', mongoose.connection.readyState); // 1 = connected

        // Get direct database reference for native operations
        const db = mongoose.connection.db;

        // Run migrations in order (respecting dependencies)
        await migrateUsers();
        await migrateInterpreterCategories();
        await migrateTermsConditions();
        await migrateEvents();
        await migrateCompanies();
        await migrateChats();
        await migrateNotes();

        // Additional migrations
        await migrateBoothQueues();
        await migrateRooms();
        await migrateMeetingDatas();
        await migrateEventInterests();
        await migrateMessages();

        // Update user assignedBooth references
        await updateUserBoothAssignments();

        console.log('\n=== Migration Complete ===');
        console.log('Please review the migrated data and run additional migrations as needed.');

    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database');
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { runMigration };

