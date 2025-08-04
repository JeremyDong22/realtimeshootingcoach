#!/bin/bash

# Start script for Production Mode (Local Testing)
# This simulates production environment locally

echo "🚀 Starting Shooting Coach in Production Mode..."

# Navigate to project directory
cd "$(dirname "$0")"

# Load environment variables from .env file
export $(cat .env | grep -v '^#' | xargs)

# Build with production optimizations
echo "📦 Building for production..."
npm run build

# Start production server
echo "✅ Starting production server on http://localhost:8000"
echo "   This simulates how your app will run in production"
echo ""
npx serve -s . -l 8000