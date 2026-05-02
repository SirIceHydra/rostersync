# RosterSync - Backend Integration Guide

## Architecture Overview

The application now uses a **microservices architecture** with:

### Backend Services
- **API Gateway** (Port 4000) - Single entry point
- **Auth Service** (Port 4001) - Authentication & Registration
- **Roster Service** (Port 4002) - Roster generation & management
- **Request Service** (Port 4003) - Doctor requests
- **User Service** (Port 4004) - User/doctor management
- **Analytics Service** (Port 4005) - Fairness reports

### Database
- **PostgreSQL** (`DATABASE_URL` in `backend/.env`)
- Automatic schema creation
- Indexed for performance

### Frontend
- React + TypeScript
- API client for backend communication
- Calendar/Table view for rosters
- Login/Register forms

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev  # Starts all services
```

### 2. Frontend Setup

```bash
# In project root
npm install
npm run dev  # Starts on http://localhost:3000
```

### 3. Environment Variables

**Backend** (`backend/.env`):
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/rostersync
JWT_SECRET=your-secret-key
# Optional in dev — defaults allow common localhost:Vite ports
# CORS_ORIGIN=http://localhost:3000,http://localhost:3003
```

**Frontend** (`.env` in repo root):
```env
# Optional: leave unset so `npm run dev` proxies /api → gateway :4000
# VITE_API_URL=http://localhost:4000
# VITE_GATEWAY_PROXY_TARGET=http://127.0.0.1:4000
```

**Always use the gateway (4000) from the SPA.** Do not point `VITE_API_URL` at auth/roster/etc. ports — routes like `/api/rosters/archive` are only wired through the gateway in typical setups.

## Features Implemented

### ✅ Authentication & Registration
- User registration with email/password
- Login with JWT tokens
- Role-based access (Admin/Doctor)
- Token verification

### ✅ Roster Management
- Auto-generation with fairness algorithm
- Calendar/Table view
- List view (day-by-day)
- Manual shift reassignment
- Publish/Draft workflow

### ✅ Request System
- Create requests (Unavailable, Leave, Swap)
- Public visibility
- Admin approve/reject
- First-come-first-served priority

### ✅ User Management
- Add/remove doctors (admin)
- Update user profiles
- View all doctors

### ✅ Analytics
- Fairness reports
- Workload equity metrics
- Public holiday tracking

## API Integration

The frontend uses the API client (`src/api/client.ts`) which automatically:
- Handles JWT tokens
- Manages authentication headers
- Provides type-safe API methods

Example usage:
```typescript
import { api } from './api/client';

// Login
const { user, token } = await api.login(email, password);
api.setToken(token);

// Get roster
const roster = await api.getRoster(2026, 0); // January 2026

// Generate roster
const { roster, report } = await api.generateRoster();
```

## Scalability

The microservices architecture enables:

1. **Horizontal Scaling**: Scale each service independently
2. **Service Isolation**: Failures don't cascade
3. **Technology Flexibility**: Use different stacks per service
4. **Database Scaling**: Easy migration to distributed DBs

### Production Recommendations:
- Use PostgreSQL instead of SQLite
- Add Redis for caching
- Implement message queues for async tasks
- Add API rate limiting
- Use service discovery
- Add monitoring & logging
- Container orchestration (Kubernetes)

## Migration from localStorage

The app now uses the backend API instead of localStorage. To migrate existing data:

1. Register users through the new registration form
2. Recreate rosters using the "Generate Roster" button
3. Requests will be stored in the database

## Calendar View

The roster now has two views:
- **Calendar View**: Full month table showing all shifts
- **List View**: Day-by-day detailed view

Toggle between views using the buttons in the Roster page.

## Security

- JWT authentication
- Password hashing (bcrypt)
- Role-based access control
- CORS protection
- SQL injection protection

## Testing

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `npm run dev`
3. Register a new admin account
4. Register doctor accounts
5. Generate a roster
6. Test all features

## Troubleshooting

**Services won't start:**
- Check ports aren't in use
- Verify `.env` file exists
- Check database directory permissions

**API errors:**
- Verify backend is running
- Check CORS settings
- Verify JWT token is valid

**Database issues:**
- Delete `backend/data/rostersync.db` to reset
- Check file permissions
