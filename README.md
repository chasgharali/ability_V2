# Ability V2 - Accessible Video Interview Platform

A comprehensive video interview platform with real-time queue management, designed with accessibility as a core requirement (WCAG 2.1 AA compliance).

## 🎯 Key Features

- **Multi-role System**: Admin, Event Admin, Booth Admin, Recruiter, Interpreter, Support, Job Seeker
- **Real-time Queue Management**: Live token updates with WebSocket integration
- **Accessible Design**: High contrast theme, screen reader support, keyboard navigation
- **Video Calls**: Twilio Programmable Video integration with interpreter support
- **File Management**: S3 storage for resumes, audio/video messages
- **Rich Content**: WYSIWYG editor for booth content sections

## 🏗️ Architecture

```
├── client/          # React frontend
├── server/          # Node.js/Express backend
├── shared/          # Shared types and utilities
└── docs/           # Documentation and deployment guides
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB
- Redis
- AWS Account (S3, SES)
- Twilio Account

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository>
cd ability-v2
npm install
cd client && npm install
cd ../server && npm install
```

2. **Environment Setup:**
```bash
# Copy environment templates
cp server/.env.example server/.env
cp client/.env.example client/.env

# Configure your environment variables
# See deployment section for required variables
```

3. **Start Development:**
```bash
npm run dev
```

## 🧪 Testing

### Accessibility Testing
```bash
# Run automated accessibility tests
npm run test:accessibility

# Manual testing checklist:
# 1. Test with NVDA screen reader
# 2. Test with JAWS screen reader  
# 3. Test keyboard-only navigation
# 4. Test with high contrast mode
# 5. Test with zoom up to 200%
```

### Manual Accessibility Test Steps

1. **Registration Flow:**
   - Navigate using Tab key only
   - Verify all form fields are announced correctly
   - Test error message announcements

2. **Queue Management:**
   - Verify live token updates are announced
   - Test queue position changes
   - Verify leave queue confirmation

3. **Video Call:**
   - Test call join/leave with keyboard
   - Verify interpreter request flow
   - Test chat functionality

## 📱 User Roles & Permissions

| Role | Permissions |
|------|-------------|
| **Admin** | Full system access, user management |
| **AdminEvent** | Event creation, booth management |
| **BoothAdmin** | Booth content editing, queue oversight |
| **Recruiter** | Call management, feedback submission |
| **Interpreter** | Join calls as interpreter |
| **GlobalInterpreter** | Join any call as interpreter |
| **Support** | User assistance, queue monitoring |
| **GlobalSupport** | System-wide support access |
| **JobSeeker** | Queue joining, call participation |

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh

### Events & Booths
- `GET /api/events` - List events
- `POST /api/events` - Create event (AdminEvent+)
- `GET /api/events/:id/booths` - List event booths
- `POST /api/events/:id/booths` - Create booth

### Queue Management
- `POST /api/events/:id/booths/:boothId/join` - Join queue
- `GET /api/queues/:queueId/status` - Queue status
- `POST /api/queues/:queueId/leave` - Leave queue

### Video Calls
- `POST /api/calls/init` - Initialize call
- `POST /api/calls/:callId/request-interpreter` - Request interpreter
- `POST /api/meetings/:id/feedback` - Submit feedback

### File Management
- `POST /api/uploads/presign` - Get S3 presigned URL
- `POST /api/uploads/complete` - Confirm upload completion

## 🎨 Accessibility Features

### Visual Design
- High contrast black & white theme
- Scalable typography (rem units)
- Large hit targets (minimum 44px)
- Focus indicators on all interactive elements

### Screen Reader Support
- Semantic HTML structure
- ARIA labels and roles
- Live regions for dynamic updates
- Skip links and landmarks

### Keyboard Navigation
- Full keyboard operability
- Logical tab order
- Arrow key support for lists
- Enter/Space activation

## 🚀 Deployment

### AWS Deployment
```bash
# Build for production
npm run build

# Deploy to AWS (see docs/deployment.md for details)
aws s3 sync client/build/ s3://your-bucket-name
```

### Environment Variables
See `docs/environment-setup.md` for complete configuration guide.

## 📊 Monitoring & Analytics

- Real-time queue metrics
- Call quality monitoring
- Accessibility compliance tracking
- User engagement analytics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure accessibility compliance
4. Add tests for new features
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For accessibility issues or questions:
- Create an issue with `accessibility` label
- Contact: support@ability-platform.com
