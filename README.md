# RosterSync Medical MVP

A phone-first web application for medical department roster management with automated fairness algorithms, public request tracking, and transparent analytics.

## Features

✅ **Auto Roster Generation** - Intelligent algorithm ensuring fair shift distribution  
✅ **Calendar & List Views** - Full month calendar table + day-by-day list view  
✅ **Public Request System** - Transparent leave/swap requests visible to all doctors  
✅ **Fairness Analytics** - Real-time workload equity tracking and warnings  
✅ **Role-Based Access** - Admin (Medical Officer) and Doctor roles  
✅ **Microservices Backend** - Scalable architecture with REST APIs  
✅ **Offline Support** - Falls back to localStorage when backend unavailable  

## Quick Start

### Frontend Only (Demo Mode)

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` - Works with localStorage fallback.

### Full Stack (Backend + Frontend)

**1. Start Backend Services:**

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your settings
npm run dev  # Starts all microservices
```

**2. Start Frontend:**

```bash
# In project root
npm install
npm run dev
```

**3. Register & Login:**

- Visit `http://localhost:3000`
- Click "Register" to create an account
- Login with your credentials

## Architecture

### Frontend
- React + TypeScript
- Vite build system
- Responsive mobile-first design
- API client with automatic fallback

### Backend (Microservices)
- **API Gateway** (Port 4000) - Routes requests
- **Auth Service** (Port 4001) - JWT authentication
- **Roster Service** (Port 4002) - Roster generation
- **Request Service** (Port 4003) - Doctor requests
- **User Service** (Port 4004) - User management
- **Analytics Service** (Port 4005) - Fairness reports

### Database
- SQLite (development)
- Ready for PostgreSQL/MySQL (production)

## Project Structure

```
rostersync-medical-mvp/
├── backend/              # Microservices backend
│   ├── services/         # Individual microservices
│   ├── shared/          # Shared utilities (DB, auth, types)
│   └── package.json
├── src/
│   ├── api/             # API client
│   └── components/      # React components
├── App.tsx              # Main application
├── types.ts             # TypeScript types
├── constants.ts         # Constants & templates
├── rosterEngine.ts      # Roster generation algorithm
└── package.json
```

## Key Features

### Roster Generation
- Automatic shift assignment with fairness constraints
- No consecutive shifts enforcement
- Weekend/holiday balancing
- Public holiday priority tracking

### Calendar View
- Full month table showing all shifts
- Color-coded shifts (your shifts, holidays, today)
- Toggle between Calendar and List views

### Request Management
- Public visibility (all doctors see all requests)
- Admin-only confidential reasons
- First-come-first-served priority
- Approve/reject workflow

### Analytics
- Workload equity index
- Public holiday ledger
- Fairness violation warnings

## Environment Variables

**Frontend** (`.env`):
```env
VITE_API_URL=http://localhost:4000
```

**Backend** (`backend/.env`):
```env
JWT_SECRET=your-secret-key
DB_PATH=./data/rostersync.db
CORS_ORIGIN=http://localhost:3000
```

## Build

**Frontend:**
```bash
npm run build
```

**Backend:**
```bash
cd backend
npm run build
```

## Testing

1. **Frontend Only:** Works standalone with localStorage
2. **Full Stack:** Start backend, then frontend
3. **Register** an admin account
4. **Add doctors** via Staff management
5. **Generate roster** from Dashboard
6. **View calendar** in Roster tab
7. **Submit requests** as doctors
8. **Approve/reject** as admin

## Troubleshooting

### ECONNREFUSED Error on Registration/Login

**Symptom:** Error message like `[HPM] Error occurred while proxying request ... to http://localhost:4001/ [ECONNREFUSED]`

**Cause:** The API Gateway is running but the individual microservices are not.

**Solution:** Make sure to run `npm run dev` from the `backend/` folder. This starts ALL services together using `concurrently`. If you previously ran only `npm run dev:gateway`, stop it (Ctrl+C) and run `npm run dev` instead.

### Database Not Created

**Symptom:** Database-related errors when registering or fetching data.

**Solution:** The database and `data/` directory are created automatically on first service start. Make sure you have write permissions to the backend folder.

### CORS Errors

**Symptom:** "Blocked by CORS policy" in browser console.

**Solution:** Ensure the `CORS_ORIGIN` in `backend/.env` matches your frontend URL (default: `http://localhost:3000`).

## API Documentation

See `backend/README.md` for complete API documentation.

## Scalability

The microservices architecture enables:
- Independent service scaling
- Service isolation (failures don't cascade)
- Technology flexibility per service
- Easy database migration (SQLite → PostgreSQL)

## Security

- JWT authentication
- Password hashing (bcrypt)
- Role-based access control
- CORS protection
- SQL injection protection

## License

Private - Medical MVP
