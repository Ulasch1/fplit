# Fplit: Group Expense Splitting

Fplit is a group expense-splitting application that tracks who owes whom, computes net balances, and simplifies debts to a minimum number of transfers. It includes a two-sided confirmation flow when settling up, so both payer and payee must confirm the payment.

## Features

- Email/password auth (JWT)
- Create groups, invite members via shareable link
- Add expenses, split live across the group's current membership (not frozen at creation time)
- Checklist view: net balances and simplified debt transfers (minimum number of payments)
- Two-sided payment confirmation (payer marks paid, payee confirms or rejects) with notifications
- Groups auto-close once every balance nets to zero

## Repo layout

- `backend/`: Node.js + Express + TypeScript + Prisma (PostgreSQL). See [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) for the architecture and full API reference.
- `frontend/`: Next.js (App Router) + TypeScript + Tailwind CSS

## Tech stack

| Layer        | Technology                                | Hosting target   |
|--------------|-------------------------------------------|------------------|
| Frontend     | Next.js, React, TypeScript, Tailwind CSS  | Vercel           |
| Backend      | Node.js, Express, TypeScript, Prisma      | Railway          |
| Database     | PostgreSQL                                | Railway (plugin) |


## Local development

### 1. Start PostgreSQL

The easiest way is Docker (replace the password as you like):

```bash
docker run --name fplit-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fplit -p 5432:5432 -d postgres:16-alpine
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env → DATABASE_URL with your local Postgres connection string
npm run dev         # → http://localhost:4000
```

Health check endpoint: `GET http://localhost:4000/health`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev         # → http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL=http://localhost:4000` (already provided in `.env.local.example`).

---

## Deployment

### Backend → Railway

1. Create a new Railway project, add a PostgreSQL plugin.
2. Set the service root directory to `backend/`.
3. Environment variables:

   | Variable       | Value                           |
   |----------------|---------------------------------|
   | DATABASE_URL   | `${{Postgres.DATABASE_URL}}` (Railway provides this automatically) |
   | PORT           | Automatically set by Railway – do NOT create it manually. The backend reads `process.env.PORT` and falls back to 4000 locally. |
   | CORS_ORIGIN    | The Vercel frontend URL         |

4. Build command: `npm run build`
5. Start command: `npm start`
6. Run `npx prisma migrate deploy` (or set it as a Railway deploy step) to apply migrations against the production database.

### Frontend → Vercel

1. Import the repository.
2. Set root directory to `frontend/`.
3. Environment variable:

   | Variable               | Value                                 |
   |------------------------|---------------------------------------|
   | NEXT_PUBLIC_API_URL    | Railway backend URL (e.g., `https://fplit-backend.up.railway.app`) |

4. Framework is auto-detected (Next.js).

### Required environment variables summary

| Variable              | Where            | Example                                       |
|-----------------------|------------------|-----------------------------------------------|
| DATABASE_URL          | backend (Railway)| `postgresql://...`                            |
| PORT                  | backend (Railway)| Set automatically by Railway; do not set manually (app falls back to 4000 locally) |
| CORS_ORIGIN           | backend (Railway)| `https://fplit-frontend.vercel.app`           |
| NEXT_PUBLIC_API_URL   | frontend (Vercel)| `https://fplit-backend.up.railway.app`        |

---

## Milestone status

- **M1: done.** Skeleton + health check + database connection. Deploy-ready, not yet actually deployed (no Railway/Vercel project set up).
- **M2: done.** Auth: register, login, JWT middleware.
- **M3: done.** Group CRUD + ownership transfer.
- **M4: done.** Invite link flow.
- **M5: done.** Expenses + splitting.
- **M6: done.** Checklist computation (net balances + debt simplification).
- **M7: done.** Payments, two-sided confirmation, notifications, group auto-close.
- **M8: done.** Frontend: auth, home, group detail, expense creation screens.
- **M9: done.** Frontend: checklist interaction (mark as paid) + notifications.
- **M10: remaining.** Polish + edge-case pass, final README, live deploy.
