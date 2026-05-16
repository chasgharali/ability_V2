jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { _id: 'super-admin-id', id: 'super-admin-id', role: 'SuperAdmin' };
    req.orgId = null;
    next();
  },
  requireRole: () => (req, res, next) => next()
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

jest.mock('../services/defaultCopyService', () => ({
  getTargetAdminUser: jest.fn(),
  cloneRoleMessageTemplateToOrganization: jest.fn(),
  syncMissingRoleMessagesForOrganization: jest.fn()
}));

jest.mock('../models/RoleMessage', () => ({
  findOne: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const RoleMessage = require('../models/RoleMessage');
const { syncMissingRoleMessagesForOrganization } = require('../services/defaultCopyService');
const roleMessagesRouter = require('../routes/roleMessages');

describe('Role messages default routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/role-messages', roleMessagesRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('set-default marks template only and does not trigger org sync fan-out', async () => {
    const save = jest.fn().mockResolvedValue();
    const template = {
      _id: 'template-1',
      organizationId: null,
      isPlatformDefault: false,
      updatedBy: null,
      save
    };
    RoleMessage.findOne.mockResolvedValue(template);

    const response = await request(app)
      .post('/api/role-messages/template-1/set-default')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(template.isPlatformDefault).toBe(true);
    expect(template.updatedBy).toBe('super-admin-id');
    expect(save).toHaveBeenCalledTimes(1);
    expect(syncMissingRoleMessagesForOrganization).not.toHaveBeenCalled();
  });
});
