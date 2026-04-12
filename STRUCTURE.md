# Project Structure - RosterSync Medical MVP

## Clean File Organization

```
rostersync-medical-mvp/
│
├── 📁 backend/                    # Microservices Backend
│   ├── 📁 services/              # Individual microservices
│   │   ├── auth-service.ts       # Authentication & Registration
│   │   ├── roster-service.ts     # Roster generation & management
│   │   ├── request-service.ts    # Request handling
│   │   ├── user-service.ts       # User/doctor management
│   │   ├── analytics-service.ts  # Fairness reports
│   │   └── gateway.ts            # API Gateway
│   ├── 📁 shared/                # Shared backend utilities
│   │   ├── database.ts           # SQLite database layer
│   │   ├── auth.ts               # JWT authentication
│   │   ├── types.ts              # TypeScript types
│   │   ├── constants.ts          # Constants & templates
│   │   └── rosterEngine.ts       # Roster generation algorithm
│   ├── package.json              # Backend dependencies
│   ├── tsconfig.json            # TypeScript config
│   ├── start.sh                 # Startup script
│   └── README.md                # Backend documentation
│
├── 📁 src/                       # Frontend Source
│   ├── 📁 api/
│   │   └── client.ts            # API client with fallback
│   └── 📁 components/
│       ├── LoginForm.tsx        # Authentication UI
│       ├── CalendarView.tsx     # Calendar table component
│       ├── Card.tsx            # Reusable card component
│       ├── Button.tsx          # Reusable button component
│       └── Badge.tsx           # Reusable badge component
│
├── 📄 App.tsx                   # Main React application
├── 📄 types.ts                  # Frontend TypeScript types
├── 📄 constants.ts              # Frontend constants
├── 📄 rosterEngine.ts          # Frontend roster engine (fallback)
├── 📄 index.tsx                 # React entry point
├── 📄 index.html                # HTML template
├── 📄 index.css                 # Global styles
├── 📄 vite.config.ts            # Vite configuration
├── 📄 tsconfig.json             # TypeScript config
├── 📄 package.json              # Frontend dependencies
│
├── 📄 README.md                 # Main documentation
├── 📄 INTEGRATION.md            # Integration guide
├── 📄 TESTING.md                # Testing guide
├── 📄 PROJECT_STATUS.md         # Project status
├── 📄 STRUCTURE.md               # This file
│
└── 📄 .gitignore                # Git ignore rules
```

## File Purposes

### Backend Services
- **gateway.ts**: Routes requests to appropriate microservices
- **auth-service.ts**: Handles login, register, token verification
- **roster-service.ts**: Generates rosters, manages shifts
- **request-service.ts**: Manages doctor requests
- **user-service.ts**: Manages user/doctor CRUD operations
- **analytics-service.ts**: Generates fairness reports

### Shared Backend
- **database.ts**: SQLite connection and schema
- **auth.ts**: JWT token generation/verification, middleware
- **rosterEngine.ts**: Core roster generation algorithm
- **types.ts**: Shared TypeScript interfaces
- **constants.ts**: Shift templates, holidays

### Frontend Components
- **App.tsx**: Main application with all views
- **LoginForm.tsx**: Authentication UI
- **CalendarView.tsx**: Month calendar table view
- **Card/Button/Badge**: Reusable UI components

### Frontend API
- **client.ts**: API client with automatic fallback to localStorage

## Duplicate Files (Intentional)

- `rosterEngine.ts` exists in both root and `backend/shared/`
  - Root: For frontend fallback mode
  - Backend: For microservices
- `types.ts` and `constants.ts` exist in both locations
  - Same reason - needed by both frontend and backend

## Build Outputs

- `dist/` - Frontend production build (gitignored)
- `backend/dist/` - Backend compiled output (gitignored)
- `backend/data/` - SQLite database files (gitignored)

## Clean Structure ✅

- No duplicate unnecessary files
- Clear separation of concerns
- Organized by feature/function
- All imports resolve correctly
- Build passes successfully
