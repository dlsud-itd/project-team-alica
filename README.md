# Checkpoint: QR-based event RSVP and attendance management system

Team ALICA

## About the project

Checkpoint helps event organisers, staff and attendees manage RSVPs and check in with QR codes.

The repository features two site setups:
- [Production](https://checkpoint.dlsud-ilt.workers.dev/)
- [Development](https://dev-checkpoint.dlsud-ilt.workers.dev/)

## Project Structure

The repository contains 2 main application folders:
- [frontend](frontend): Angular client application
- [backend](backend): NestJS REST API

## Technology stack

- Frontend: Angular 22 with standalone components, RxJS and SCSS
- Backend: NestJS 12 REST API
- Database: PostgreSQL with Prisma ORM

## Project structure

```text
project-team-alica/
├── backend/          # NestJS application and Prisma schema
├── frontend/         # Angular application and styles
├── document/         # Project proposals and design specifications
├── package.json      # Root runner scripts
└── README.md
```

## Getting started

### Prerequisites

Install these tools before you start:
- Node.js (version 20 or higher)
- npm (version 10 or higher)
- PostgreSQL (local instance or cloud database)

### 1. Install dependencies

Install dependencies for the root workspace, backend and frontend.

You can install all dependencies from the root directory:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

Or you can install them by changing into each folder:

```bash
npm install
cd backend && npm install
cd ../frontend && npm install
```

### 2. Set up the database and Prisma

Ensure your PostgreSQL database is running.

1. Create a database named `checkpoint_db` (or your preferred database name).
2. Copy the sample environment file and set your database connection string in `backend/.env`.

```bash
cp backend/.env.example backend/.env
```

3. Generate the Prisma client.

From the root directory:

```bash
npx prisma generate --schema=backend/prisma/schema.prisma
```

Or from the `backend` folder:

```bash
cd backend
npx prisma generate
```

### 3. Start the applications

Run both the backend and frontend together from the root directory:

```bash
npm run dev
```

This command starts:
- NestJS backend at `http://localhost:5000/api/v1`
- Angular frontend at `http://localhost:4200`

Open `http://localhost:4200` in your browser to view the application.

### 4. Run applications in separate terminals

If you prefer separate terminal windows, run:
- Backend: `npm run dev:backend` (or `cd backend && npm run start:dev`)
- Frontend: `npm run dev:frontend` (or `cd frontend && npm start`)

## Common scripts

### Root directory

- `npm run dev`: starts both backend and frontend concurrently
- `npm run build`: builds both backend and frontend
- `npm test`: runs all unit tests

### Backend

Run these commands from the root with `--prefix backend` or directly inside the `backend` folder:
- `npm run start:dev`: starts the NestJS server with live reload
- `npm run build`: compiles the backend application to `dist`
- `npm run lint`: runs Oxlint on backend source and test files
- `npm test`: runs backend unit tests with Vitest

### Frontend

Run these commands from the root with `--prefix frontend` or directly inside the `frontend` folder:
- `npm start`: starts the Angular development server
- `npm run build`: builds the Angular application for production
- `npm test`: runs frontend unit tests with Vitest
