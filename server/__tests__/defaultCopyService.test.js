jest.mock('../models/Note', () => {
    const Note = jest.fn().mockImplementation((doc) => ({
        ...doc,
        save: jest.fn().mockResolvedValue()
    }));
    Note.findOne = jest.fn();
    Note.find = jest.fn();
    return Note;
});

jest.mock('../models/TermsConditions', () => {
    const TermsConditions = jest.fn().mockImplementation((doc) => ({
        ...doc,
        save: jest.fn().mockResolvedValue()
    }));
    TermsConditions.findOne = jest.fn();
    TermsConditions.find = jest.fn();
    return TermsConditions;
});

jest.mock('../models/RoleMessage', () => {
    const RoleMessage = jest.fn().mockImplementation((doc) => ({
        ...doc,
        save: jest.fn().mockResolvedValue()
    }));
    RoleMessage.findOne = jest.fn();
    RoleMessage.find = jest.fn();
    return RoleMessage;
});

jest.mock('../models/User', () => ({
    findOne: jest.fn()
}));

const Note = require('../models/Note');
const TermsConditions = require('../models/TermsConditions');
const RoleMessage = require('../models/RoleMessage');
const User = require('../models/User');
const {
    getTargetAdminUser,
    cloneNoteTemplateToOrganization,
    cloneTermsTemplateToOrganization,
    cloneRoleMessageTemplateToOrganization
} = require('../services/defaultCopyService');

describe('defaultCopyService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('getTargetAdminUser filters to active admin users with organization', async () => {
        const selectMock = jest.fn().mockResolvedValue({ _id: 'u1' });
        User.findOne.mockReturnValue({ select: selectMock });

        await getTargetAdminUser('user-123');

        expect(User.findOne).toHaveBeenCalledWith({
            _id: 'user-123',
            role: { $in: ['Admin', 'AdminEvent'] },
            isActive: true,
            organizationId: { $ne: null }
        });
    });

    test('cloneNoteTemplateToOrganization does not overwrite existing copy by default', async () => {
        const existing = { _id: 'n-existing', save: jest.fn() };
        Note.findOne.mockResolvedValue(existing);

        const result = await cloneNoteTemplateToOrganization({
            template: { _id: 'tpl-1' },
            organizationId: 'org-1',
            actorId: 'actor-1',
            overwrite: false
        });

        expect(result.changed).toBe(false);
        expect(result.record).toBe(existing);
        expect(existing.save).not.toHaveBeenCalled();
    });

    test('cloneTermsTemplateToOrganization overwrites existing copy when requested', async () => {
        const existing = {
            _id: 't-existing',
            save: jest.fn().mockResolvedValue()
        };
        TermsConditions.findOne.mockResolvedValue(existing);

        const template = {
            _id: 'tpl-2',
            title: 'Template Terms',
            content: '<p>Content</p>',
            version: '2.0',
            isActive: true,
            isRequired: true
        };

        const result = await cloneTermsTemplateToOrganization({
            template,
            organizationId: 'org-1',
            actorId: 'actor-1',
            overwrite: true
        });

        expect(result.changed).toBe(true);
        expect(existing.title).toBe('Template Terms');
        expect(existing.version).toBe('2.0');
        expect(existing.updatedBy).toBe('actor-1');
        expect(existing.save).toHaveBeenCalled();
    });

    test('cloneRoleMessageTemplateToOrganization creates org copy with source linkage', async () => {
        RoleMessage.findOne.mockResolvedValue(null);
        const template = {
            _id: 'tpl-msg',
            role: 'JobSeeker',
            screen: 'my-account',
            messageKey: 'welcome',
            content: 'Hello',
            description: 'Welcome text'
        };

        const result = await cloneRoleMessageTemplateToOrganization({
            template,
            organizationId: 'org-1',
            actorId: 'actor-1',
            overwrite: false
        });

        expect(RoleMessage).toHaveBeenCalled();
        expect(result.changed).toBe(true);
        expect(result.record.sourceTemplateId).toBe('tpl-msg');
        expect(result.record.organizationId).toBe('org-1');
    });
});
