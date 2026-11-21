import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createApp } from './src/server/app';
import { getConfig } from './src/server/config';

async function startServer(): Promise<void> {
  const config = getConfig();
  const app = createApp({ config });

  if (config.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { maxAge: '1d' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`CivicResolve server listening on http://0.0.0.0:${config.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CivicResolve server:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
