const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema({
  company: { type: String, trim: true, default: '' },
  title: { type: String, trim: true, default: '' },
  location: { type: String, trim: true, default: '' },
  startDate: { type: String, trim: true, default: '' },
  endDate: { type: String, trim: true, default: '' },
  current: { type: Boolean, default: false },
  bullets: [{ type: String, trim: true }]
}, { _id: true });

const educationSchema = new mongoose.Schema({
  institution: { type: String, trim: true, default: '' },
  degree: { type: String, trim: true, default: '' },
  field: { type: String, trim: true, default: '' },
  graduationDate: { type: String, trim: true, default: '' },
  gpa: { type: String, trim: true, default: '' }
}, { _id: true });

const certificationSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  issuer: { type: String, trim: true, default: '' },
  date: { type: String, trim: true, default: '' }
}, { _id: true });

const customSectionSchema = new mongoose.Schema({
  title: { type: String, trim: true, default: '' },
  content: { type: String, trim: true, default: '' }
}, { _id: true });

const resumeContentSchema = new mongoose.Schema({
  name: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  location: { type: String, trim: true, default: '' },
  linkedIn: { type: String, trim: true, default: '' },
  website: { type: String, trim: true, default: '' },
  summary: { type: String, trim: true, default: '' },
  experience: [experienceSchema],
  education: [educationSchema],
  skills: [{ type: String, trim: true }],
  languages: [{ type: String, trim: true }],
  certifications: [certificationSchema],
  awards: [{ type: String, trim: true }],
  customSections: [customSectionSchema]
}, { _id: false });

const resumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  title: {
    type: String,
    trim: true,
    default: 'My Resume',
    maxlength: 100
  },
  content: {
    type: resumeContentSchema,
    default: () => ({})
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  lastAiGenerated: {
    type: Date,
    default: null
  }
}, { timestamps: true });

resumeSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Resume', resumeSchema);
