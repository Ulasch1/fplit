import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import meRouter from './routes/me';
import groupsRouter from './routes/groups';

const app = express();

// Parse JSON bodies
app.use(express.json());

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN;
if (corsOrigins) {
  const origins = corsOrigins.split(',').map(o => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins, credentials: true }));
} else {
  // Allow all origins for local development convenience
  app.use(cors());
}

// Health check endpoint
app.use(healthRouter);

// Auth routes: POST /auth/register and POST /auth/login
app.use('/auth', authRouter);

// Temporary protected test endpoint: GET /me
app.use(meRouter);
app.use('/groups', groupsRouter);

export default app;
