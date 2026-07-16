# Fplit Frontend

Next.js (App Router) + TypeScript + Tailwind CSS skeleton.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. (Optional) Set environment variables – copy the example:
   ```bash
   cp .env.local.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000` in your browser.

`NEXT_PUBLIC_API_URL` is defined for future milestones (the frontend will call the backend starting in M8); the example value points at the local backend `http://localhost:4000`.
