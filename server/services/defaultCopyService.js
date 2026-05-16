const Note = require('../models/Note');
const TermsConditions = require('../models/TermsConditions');
const RoleMessage = require('../models/RoleMessage');
const User = require('../models/User');

const ADMIN_ROLES = ['Admin', 'AdminEvent'];

async function getTargetAdminUser(targetAdminUserId) {
    const targetAdmin = await User.findOne({
        _id: targetAdminUserId,
        role: { $in: ADMIN_ROLES },
        isActive: true,
        organizationId: { $ne: null }
    }).select('_id name email role organizationId');

    return targetAdmin;
}

async function cloneNoteTemplateToOrganization({ template, organizationId, actorId, overwrite = false }) {
    if (!template || !organizationId) return { changed: false, record: null };
    const now = new Date();
    let existing = await Note.findOne({ organizationId, sourceTemplateId: template._id });

    if (existing && !overwrite) {
        return { changed: false, record: existing };
    }

    if (!existing) {
        existing = new Note({
            title: template.title,
            content: template.content,
            type: template.type,
            assignedRoles: template.assignedRoles,
            isActive: template.isActive,
            organizationId,
            sourceTemplateId: template._id,
            lastSyncedAt: now,
            createdBy: actorId,
            updatedBy: actorId
        });
        await existing.save();
        return { changed: true, record: existing };
    }

    existing.title = template.title;
    existing.content = template.content;
    existing.type = template.type;
    existing.assignedRoles = template.assignedRoles;
    existing.isActive = template.isActive;
    existing.lastSyncedAt = now;
    existing.updatedBy = actorId;
    await existing.save();
    return { changed: true, record: existing };
}

async function cloneTermsTemplateToOrganization({ template, organizationId, actorId, overwrite = false }) {
    if (!template || !organizationId) return { changed: false, record: null };
    const now = new Date();
    let existing = await TermsConditions.findOne({ organizationId, sourceTemplateId: template._id });

    if (existing && !overwrite) {
        return { changed: false, record: existing };
    }

    if (!existing) {
        existing = new TermsConditions({
            title: template.title,
            content: template.content,
            version: template.version,
            isActive: template.isActive,
            isRequired: template.isRequired,
            usage: template.usage || { totalEvents: 0, lastUsed: null },
            organizationId,
            sourceTemplateId: template._id,
            lastSyncedAt: now,
            createdBy: actorId,
            updatedBy: actorId
        });
        await existing.save();
        return { changed: true, record: existing };
    }

    existing.title = template.title;
    existing.content = template.content;
    existing.version = template.version;
    existing.isActive = template.isActive;
    existing.isRequired = template.isRequired;
    existing.lastSyncedAt = now;
    existing.updatedBy = actorId;
    await existing.save();
    return { changed: true, record: existing };
}

async function cloneRoleMessageTemplateToOrganization({ template, organizationId, actorId, overwrite = false }) {
    if (!template || !organizationId) return { changed: false, record: null };
    const now = new Date();
    let existing = await RoleMessage.findOne({
        organizationId,
        $or: [
            { sourceTemplateId: template._id },
            {
                sourceTemplateId: null,
                role: template.role,
                screen: template.screen,
                messageKey: template.messageKey
            }
        ]
    });

    if (existing && !overwrite) {
        return { changed: false, record: existing };
    }

    if (!existing) {
        existing = new RoleMessage({
            role: template.role,
            screen: template.screen,
            messageKey: template.messageKey,
            content: template.content,
            description: template.description || '',
            organizationId,
            sourceTemplateId: template._id,
            lastSyncedAt: now,
            updatedBy: actorId
        });
        await existing.save();
        return { changed: true, record: existing };
    }

    existing.content = template.content;
    existing.description = template.description || '';
    existing.sourceTemplateId = template._id;
    existing.lastSyncedAt = now;
    existing.updatedBy = actorId;
    await existing.save();
    return { changed: true, record: existing };
}

async function syncMissingNotesForOrganization({ organizationId, actorId }) {
    const templates = await Note.find({ organizationId: null, isPlatformDefault: true });
    const results = await Promise.all(
        templates.map((template) => cloneNoteTemplateToOrganization({ template, organizationId, actorId, overwrite: false }))
    );
    return results.filter((result) => result.changed).length;
}

async function syncMissingTermsForOrganization({ organizationId, actorId }) {
    const templates = await TermsConditions.find({ organizationId: null, isPlatformDefault: true });
    const results = await Promise.all(
        templates.map((template) => cloneTermsTemplateToOrganization({ template, organizationId, actorId, overwrite: false }))
    );
    return results.filter((result) => result.changed).length;
}

async function syncMissingRoleMessagesForOrganization({ organizationId, actorId }) {
    const templates = await RoleMessage.find({ organizationId: null, isPlatformDefault: true });
    const results = await Promise.all(
        templates.map((template) => cloneRoleMessageTemplateToOrganization({ template, organizationId, actorId, overwrite: false }))
    );
    return results.filter((result) => result.changed).length;
}

module.exports = {
    ADMIN_ROLES,
    getTargetAdminUser,
    cloneNoteTemplateToOrganization,
    cloneTermsTemplateToOrganization,
    cloneRoleMessageTemplateToOrganization,
    syncMissingNotesForOrganization,
    syncMissingTermsForOrganization,
    syncMissingRoleMessagesForOrganization
};
