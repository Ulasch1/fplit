# Fplit Frontend

Next.js (App Router) + TypeScript + Tailwind CSS client for the Fplit
expense-splitting app: auth, group list/detail, expense creation, invite
accept, checklist/payment confirmation, and notifications. See
[../backend/ARCHITECTURE.md](../backend/ARCHITECTURE.md) for the frontend's
structure (`app/`, `components/`, `lib/`) and how it talks to the backend API.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set environment variables, copy the example:
   ```bash
   cp .env.local.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.

`NEXT_PUBLIC_API_URL` points the client at the backend API; the example value
points at the local backend `http://localhost:4000`.
