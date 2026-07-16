import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { signToken } from '../lib/jwt';

const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DvVJ0K1Q.p8jXjT7f9m3iC2xW8G6.';

const router = Router();

// Simple email regex – good enough for this MVP
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helpers --------------------------------------------------------------------

function formatUser(user: { id: string; email: string; name: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.createdAt,
  };
}

// POST /register -------------------------------------------------------------
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validate presence and types
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Password is required' });
      return;
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!EMAIL_RE.test(normalizedEmail)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (password.length > 72) {
      res.status(400).json({ error: 'Password must be at most 72 characters' });
      return;
    }
    if (trimmedName.length === 0) {
      res.status(400).json({ error: 'Name must not be empty' });
      return;
    }

    // Pre-check for existing email (fast path, but we still catch P2002)
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: trimmedName,
      },
    });

    const token = signToken({ sub: user.id });

    res.status(201).json({
      user: formatUser(user),
      token,
    });
  } catch (error: unknown) {
    // Handle Prisma unique constraint violation (race condition)
    if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'P2002') {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    console.error('POST /auth/register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login ----------------------------------------------------------------
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const isValid = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH);
    if (!user || !isValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = signToken({ sub: user.id });

    res.status(200).json({
      user: formatUser(user),
      token,
    });
  } catch (error) {
    console.error('POST /auth/login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
