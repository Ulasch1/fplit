# Fplit Backend

Express + TypeScript + Prisma skeleton for the Fplit expense-splitting app.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` → set `DATABASE_URL` to your local PostgreSQL instance (see root README for a Docker command).
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Verify the health endpoint:
   ```
   curl http://localhost:4000/health
   ```

The `/health` route returns the DB connection status and a timestamp.
