import dotenv from 'dotenv';
dotenv.config();

import app from './app';

let PORT = 4000;
if (process.env.PORT) {
  const parsed = Number(process.env.PORT);
  if (Number.isNaN(parsed)) {
    console.warn(`Invalid PORT "${process.env.PORT}" ignored, falling back to 4000`);
  } else {
    PORT = parsed;
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Fplit backend running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
