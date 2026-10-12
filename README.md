# Checkpoint: QR-Based Event RSVP and Attendance Management System

Team ALICA (DLSU-D ITD)

## Project Overview

Checkpoint helps event organisers, staff, and attendees manage RSVPs and check in with QR codes.

The repository contains two separate application folders:
- [frontend](file:///c:/Users/Alen/Documents/dev/work/project-team-alica/frontend): Angular client application
- [backend](file:///c:/Users/Alen/Documents/dev/work/project-team-alica/backend): NestJS REST API

## Tech Stack

- Frontend: Angular (v22, Standalone components, RxJS, SCSS)
- Backend: NestJS (v12, REST API)
- Database: PostgreSQL with Prisma ORM

## Folder Structure

```text
project-team-alica/
├── backend/          # NestJS application and Prisma schema
├── frontend/         # Angular application and styles
├── document/         # Project proposals and design specifications
├── package.json      # Root runner scripts (npm run dev)
└── README.md
```

## Getting Started

### Prerequisites

Install these tools before you start:
- Node.js (version 20 or higher)
- npm (version 10 or higher)
- PostgreSQL (running locally or through a cloud provider)

### 1. Database Setup

Ensure you have a PostgreSQL database running.

Create a database named `checkpoint_db` (or use any database name you prefer).

Make sure `backend/.env` has your database connection string:
```bash
cp backend/.env.example backend/.env
```

### 2. Start Both Applications (Recommended)

Run both the backend and frontend together from the root directory:

```bash
npm run dev
```

This starts:
- NestJS backend at `http://localhost:5000/api/v1`
- Angular frontend at `http://localhost:4200`

### 3. Run Applications Separately

If you prefer separate terminal windows:
- Backend: `npm run dev:backend` (or `cd backend && npm run start:dev`)
- Frontend: `npm run dev:frontend` (or `cd frontend && npm start`)

Open `http://localhost:4200` in your browser to view the application.

## Common Scripts

### Root Directory

- `npm run dev` – runs both backend and frontend concurrently
- `npm run build` – builds both backend and frontend
- `npm test` – runs all unit tests

### Backend (`cd backend`)

- `npm run start:dev` – starts the backend with live reload
- `npm run build` – compiles the application to `dist`
- `npm run test` – runs backend unit tests

### Frontend (`cd frontend`)

- `npm start` – starts the Angular development server
- `npm run build` – builds the application for production
- `npm run test` – runs frontend unit tests
