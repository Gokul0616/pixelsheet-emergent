# Replit.md - Ultimate Pixel Sheets

## Overview

This is a comprehensive Google Sheets clone built with modern web technologies. The application features a full-stack architecture with real-time collaboration capabilities, advanced spreadsheet functionality, and a polished user interface that closely mimics Google Sheets. 

### Recent Updates (July 2025)
- ✓ Implemented Google Sheets-like grid with comprehensive cell selection and keyboard shortcuts
- ✓ Added drag-to-copy functionality and multi-cell selection with range support
- ✓ Created production-grade multi-tenant architecture with user-specific spreadsheet isolation
- ✓ Enhanced authentication system with proper JWT token handling and session management
- ✓ Implemented real-time collaboration with WebSocket support and live user presence
- ✓ Removed excessive toast notifications - now only shows important alerts (user join/leave)
- ✓ Added comprehensive dashboard for spreadsheet management with create, duplicate, delete
- ✓ Fixed cell editing and saving with proper authentication and permissions
- ✓ Implemented Google Sheets keyboard shortcuts (Ctrl+C, Ctrl+V, Arrow keys, F2, etc.)
- ✓ Added cell drag operations for copying data patterns
- ✓ Created multi-tenant data isolation - each user has separate spreadsheets
- ✓ Enhanced UI/UX to closely match Google Sheets experience

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: Radix UI primitives with custom styling
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter for lightweight client-side routing

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **API Pattern**: RESTful API with JSON responses

### Key Components

1. **Spreadsheet Grid System**
   - Virtual scrolling for performance with large datasets
   - Cell-based editing with formula support
   - Context menus for cell operations
   - Real-time cell selection and highlighting

2. **Formula Engine**
   - Custom formula parser and evaluator
   - Support for basic arithmetic, functions (SUM, AVERAGE, COUNT, etc.)
   - Cell reference resolution (A1, B2, etc.)
   - Error handling for invalid formulas

3. **UI Components**
   - Comprehensive component library based on Radix UI
   - Consistent styling with CSS variables
   - Responsive design with mobile considerations
   - Accessibility features built-in

4. **Collaboration Features**
   - Real-time updates using optimistic updates
   - Activity tracking and history
   - User presence indicators
   - Comment system for cells

## Data Flow

1. **Client-Server Communication**
   - RESTful API endpoints for CRUD operations
   - Optimistic updates for better UX
   - Error handling with toast notifications
   - Query invalidation for cache management

2. **Data Storage**
   - Normalized database schema with separate tables for spreadsheets, sheets, cells, comments, activities, and collaborators
   - JSON fields for complex data (formatting, share settings)
   - Timestamps for audit trails

3. **State Management**
   - Server state managed by TanStack Query
   - Local UI state using React hooks
   - Shared state between components via context

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **drizzle-orm**: Type-safe database queries
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Headless UI components
- **tailwindcss**: Utility-first CSS framework

### Development Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type checking
- **esbuild**: Fast bundling for production

## Deployment Strategy

### Build Process
1. **Development**: `npm run dev` - Runs both frontend and backend in development mode
2. **Production Build**: `npm run build` - Builds both frontend (Vite) and backend (esbuild)
3. **Production Start**: `npm start` - Serves the production build

### Environment Setup
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: Environment mode (development/production)
- **PORT**: Server port (defaults to 8000)

### Database Management
- **Schema**: Defined in `shared/schema.ts` using Drizzle
- **Migrations**: Generated in `migrations/` directory
- **Push**: `npm run db:push` - Pushes schema changes to database

### File Structure
```
├── client/          # Frontend React application
├── server/          # Backend Express application
├── shared/          # Shared types and schemas
├── backend/         # Alternative Python backend (Flask)
├── migrations/      # Database migrations
└── dist/           # Production build output
```

The application follows a monorepo structure with clear separation between frontend, backend, and shared code, enabling efficient development and deployment workflows.