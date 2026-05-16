const express = require('express');
const request = require('supertest');

jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { _id: 'admin-user-id', id: 'admin-user-id', email: 'admin@test.com', role: 'SuperAdmin' };
    req.orgId = null;
    next();
  },
  requireRole: () => (req, res, next) => next(),
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock('../models/User', () => ({
  find: jest.fn(),
  updateMany: jest.fn(),
}));

jest.mock('../models/Booth', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/Event', () => ({
  findById: jest.fn(),
}));

jest.mock('../models/RegisteredJobSeeker', () => ({}));
jest.mock('../models/Organization', () => ({}));
jest.mock('../models/ImportRun', () => ({}));

const User = require('../models/User');
const Booth = require('../models/Booth');
const Event = require('../models/Event');
const usersRouter = require('../routes/users');
const withSelect = (result) => ({ select: jest.fn().mockResolvedValue(result) });

describe('users bulk update assignment route', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    User.updateMany.mockResolvedValue({ modifiedCount: 0 });
  });

  test('updates eligible users with booth/event assignments using validated save path', async () => {
    const recruiterUser = {
      _id: '507f1f77bcf86cd799439031',
      role: 'Recruiter',
      assignedBooth: '507f1f77bcf86cd799439010',
      assignedEvents: [],
      refreshImportReadiness: jest.fn(),
      save: jest.fn().mockResolvedValue(),
    };
    User.find.mockResolvedValue([recruiterUser]);

    const targetBoothId = '507f1f77bcf86cd799439011';
    const inBoothEventId = '507f1f77bcf86cd799439021';
    const outsideBoothEventId = '507f1f77bcf86cd799439022';

    Booth.findById
      .mockReturnValueOnce(withSelect({ _id: targetBoothId }))
      .mockReturnValueOnce(withSelect({
        _id: targetBoothId,
        events: [{ toString: () => inBoothEventId }],
      }));
    Event.findById
      .mockReturnValueOnce(withSelect({ _id: inBoothEventId }))
      .mockReturnValueOnce(withSelect({ _id: outsideBoothEventId }));

    const response = await request(app)
      .put('/api/users/bulk-update')
      .send({
        userIds: [recruiterUser._id],
        updates: {
          assignedBooth: targetBoothId,
          assignedEvents: [inBoothEventId, outsideBoothEventId],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.modifiedCount).toBe(1);
    expect(recruiterUser.assignedBooth).toBe(targetBoothId);
    expect(recruiterUser.assignedEvents).toEqual([inBoothEventId]);
    expect(recruiterUser.refreshImportReadiness).toHaveBeenCalledTimes(1);
    expect(recruiterUser.save).toHaveBeenCalledTimes(1);
    expect(User.updateMany).not.toHaveBeenCalled();
  });

  test('silently ignores booth/event assignment for ineligible selected roles', async () => {
    const ineligibleUser = {
      _id: '507f1f77bcf86cd799439032',
      role: 'AdminEvent',
      assignedBooth: null,
      assignedEvents: ['507f1f77bcf86cd799439020'],
      refreshImportReadiness: jest.fn(),
      save: jest.fn().mockResolvedValue(),
    };
    User.find.mockResolvedValue([ineligibleUser]);

    const response = await request(app)
      .put('/api/users/bulk-update')
      .send({
        userIds: [ineligibleUser._id],
        updates: {
          isActive: true,
          assignedBooth: '507f1f77bcf86cd799439041',
          assignedEvents: ['507f1f77bcf86cd799439023'],
        },
      });

    expect(response.status).toBe(200);
    expect(ineligibleUser.isActive).toBe(true);
    expect(ineligibleUser.assignedBooth).toBeNull();
    expect(ineligibleUser.assignedEvents).toEqual(['507f1f77bcf86cd799439020']);
    expect(ineligibleUser.save).toHaveBeenCalledTimes(1);
    expect(Booth.findById).not.toHaveBeenCalled();
    expect(Event.findById).not.toHaveBeenCalled();
  });

  test('rejects invalid event ids in assignment payload', async () => {
    User.find.mockResolvedValue([
      {
        _id: '507f1f77bcf86cd799439033',
        role: 'GlobalInterpreter',
        assignedBooth: null,
        assignedEvents: [],
        refreshImportReadiness: jest.fn(),
        save: jest.fn().mockResolvedValue(),
      },
    ]);

    const response = await request(app)
      .put('/api/users/bulk-update')
      .send({
        userIds: ['507f1f77bcf86cd799439033'],
        updates: {
          assignedEvents: ['invalid-event-id'],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid event');
  });

  test('uses validated save path for assignedEvents-only updates', async () => {
    const globalInterpreter = {
      _id: '507f1f77bcf86cd799439034',
      role: 'GlobalInterpreter',
      assignedBooth: null,
      assignedEvents: [],
      refreshImportReadiness: jest.fn(),
      save: jest.fn().mockResolvedValue(),
    };
    User.find.mockResolvedValue([globalInterpreter]);
    Event.findById.mockReturnValue(withSelect({ _id: '507f1f77bcf86cd799439024' }));

    const response = await request(app)
      .put('/api/users/bulk-update')
      .send({
        userIds: [globalInterpreter._id],
        updates: {
          assignedEvents: ['507f1f77bcf86cd799439024'],
        },
      });

    expect(response.status).toBe(200);
    expect(globalInterpreter.save).toHaveBeenCalledTimes(1);
    expect(User.updateMany).not.toHaveBeenCalled();
  });

  test('handles mixed-role bulk updates and ignores incompatible role assignments only', async () => {
    const recruiterUser = {
      _id: '507f1f77bcf86cd799439035',
      role: 'Recruiter',
      assignedBooth: '507f1f77bcf86cd799439010',
      assignedEvents: [],
      isActive: false,
      refreshImportReadiness: jest.fn(),
      save: jest.fn().mockResolvedValue(),
    };
    const adminEventUser = {
      _id: '507f1f77bcf86cd799439036',
      role: 'AdminEvent',
      assignedBooth: null,
      assignedEvents: [],
      isActive: false,
      refreshImportReadiness: jest.fn(),
      save: jest.fn().mockResolvedValue(),
    };
    User.find.mockResolvedValue([recruiterUser, adminEventUser]);

    const boothId = '507f1f77bcf86cd799439012';
    const eventId = '507f1f77bcf86cd799439025';
    Booth.findById
      .mockReturnValueOnce(withSelect({ _id: boothId }))
      .mockReturnValueOnce(withSelect({
        _id: boothId,
        events: [{ toString: () => eventId }],
      }));
    Event.findById.mockReturnValueOnce(withSelect({ _id: eventId }));

    const response = await request(app)
      .put('/api/users/bulk-update')
      .send({
        userIds: [recruiterUser._id, adminEventUser._id],
        updates: {
          isActive: true,
          assignedBooth: boothId,
          assignedEvents: [eventId],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.modifiedCount).toBe(2);

    expect(recruiterUser.isActive).toBe(true);
    expect(recruiterUser.assignedBooth).toBe(boothId);
    expect(recruiterUser.assignedEvents).toEqual([eventId]);

    expect(adminEventUser.isActive).toBe(true);
    expect(adminEventUser.assignedBooth).toBeNull();
    expect(adminEventUser.assignedEvents).toEqual([]);

    expect(recruiterUser.save).toHaveBeenCalledTimes(1);
    expect(adminEventUser.save).toHaveBeenCalledTimes(1);
  });
});
