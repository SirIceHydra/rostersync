# RosterSync Backend - Microservices Architecture

## Overview

This is a microservices-based backend for the RosterSync Medical MVP application. The architecture consists of:

- **API Gateway** (Port 4000) - Routes requests to appropriate services
- **Auth Service** (Port 4001) - Handles authentication and registration
- **Roster Service** (Port 4002) - Manages roster generation and shifts
- **Request Service** (Port 4003) - Handles doctor requests (leave, swaps, etc.)
- **User Service** (Port 4004) - Manages user/doctor profiles
- **Analytics Service** (Port 4005) - Provides fairness reports and metrics

## Database

Uses SQLite for simplicity (can be easily swapped to PostgreSQL/MySQL for production).

Database file: `./data/rostersync.db` (created automatically)

## Setup

1. Install dependencies:
```bash
cd backend
npm install
```

2. Create `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
DB_PATH=./data/rostersync.db
CORS_ORIGIN=http://localhost:3000
```

4. Start all services (uses `concurrently` to run all microservices together):
```bash
npm run dev
```

This will start ALL 6 services:
- Auth Service (port 4001)
- Roster Service (port 4002)
- Request Service (port 4003)
- User Service (port 4004)
- Analytics Service (port 4005)
- API Gateway (port 4000) - starts after 2s delay

Or start individual services separately:
```bash
npm run dev:auth      # Auth Service only
npm run dev:roster    # Roster Service only
npm run dev:request   # Request Service only
npm run dev:user      # User Service only
npm run dev:analytics # Analytics Service only
npm run dev:gateway   # Gateway only (requires other services running)
```

**Important**: If you only run the gateway, API calls will fail with ECONNREFUSED because the individual microservices are not running. Always use `npm run dev` to start everything together.

## API Endpoints

### Authentication (`/api/auth`)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/verify` - Verify token

### Users (`/api/users`)
- `GET /api/users/doctors` - Get all doctors (authenticated)
- `GET /api/users` - Get all users (admin only)
- `POST /api/users` - Add doctor (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)
- `PATCH /api/users/:id` - Update user (admin only)

### Rosters (`/api/rosters`)
- `GET /api/rosters/:year/:month` - Get roster for month
- `POST /api/rosters/generate` - Generate roster (admin only)
- `PATCH /api/rosters/:rosterId/shifts/:shiftId` - Update shift (admin only)
- `POST /api/rosters/:rosterId/publish` - Publish roster (admin only)

### Requests (`/api/requests`)
- `GET /api/requests` - Get all requests (authenticated)
- `POST /api/requests` - Create request
- `PATCH /api/requests/:id/status` - Update request status (admin only)

### Analytics (`/api/analytics`)
- `GET /api/analytics/roster/:year/:month/fairness` - Get fairness report

## Scalability

The microservices architecture allows for:
- **Horizontal Scaling**: Each service can be scaled independently
- **Service Isolation**: Failures in one service don't affect others
- **Technology Flexibility**: Services can use different tech stacks if needed
- **Database Scaling**: Easy to migrate to distributed databases (PostgreSQL, MongoDB)

### Production Recommendations:
1. Use PostgreSQL instead of SQLite
2. Add Redis for caching and session management
3. Use message queues (RabbitMQ/Kafka) for async processing
4. Add API rate limiting
5. Implement service discovery (Consul, etcd)
6. Add monitoring (Prometheus, Grafana)
7. Use container orchestration (Kubernetes, Docker Swarm)

## Security

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control (RBAC)
- CORS protection
- SQL injection protection (parameterized queries)

## Development

The backend uses TypeScript and ES modules. Services communicate via HTTP REST APIs through the gateway.
