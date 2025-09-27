#!/bin/bash

# Ability V2 Development Setup Script
echo "🚀 Setting up Ability V2 for development..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.development .env
    echo "✅ Created .env file. Please update it with your configuration."
else
    echo "✅ .env file already exists"
fi

# Create logs directory
mkdir -p logs

cd ..

# Install client dependencies
echo "📦 Installing client dependencies..."
cd client
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating client .env file..."
    cat > .env << EOF
REACT_APP_API_URL=http://localhost:5000
REACT_APP_SOCKET_URL=http://localhost:5000
# Add your Twilio credentials here when ready
# REACT_APP_TWILIO_ACCOUNT_SID=your-twilio-account-sid
# REACT_APP_TWILIO_API_KEY=your-twilio-api-key
# REACT_APP_TWILIO_API_SECRET=your-twilio-api-secret
EOF
    echo "✅ Created client .env file"
else
    echo "✅ Client .env file already exists"
fi

cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Set up MongoDB (local or Atlas):"
echo "   - Local: Install MongoDB and start it"
echo "   - Atlas: Create a cluster and update MONGODB_URI in server/.env"
echo ""
echo "2. Set up Redis (optional for development):"
echo "   - Local: Install Redis and start it"
echo "   - Or use Redis Cloud for development"
echo ""
echo "3. Configure Twilio (optional for development):"
echo "   - Sign up at https://twilio.com"
echo "   - Get your credentials from the console"
echo "   - Update TWILIO_* variables in server/.env"
echo ""
echo "4. Start the development servers:"
echo "   npm run dev"
echo ""
echo "5. Or start them separately:"
echo "   npm run server:dev  # Backend on :5000"
echo "   npm run client:dev  # Frontend on :3000"
echo ""
echo "📚 For more information, see:"
echo "   - README.md - Project overview"
echo "   - docs/deployment.md - Production deployment"
echo "   - docs/accessibility-testing.md - Testing procedures"
echo ""
echo "🔧 The server will start without Twilio credentials, but video calls won't work until configured."

