#!/bin/bash

# Start all microservices in background
echo "🚀 Starting RosterSync Microservices..."

# Create data directory if it doesn't exist
mkdir -p data

# Start services in background
npm run dev:auth &
npm run dev:roster &
npm run dev:request &
npm run dev:user &
npm run dev:analytics &

# Wait a moment for services to start
sleep 2

# Start gateway (foreground so we can see logs)
echo "✅ All services started. Gateway starting..."
npm run dev:gateway
