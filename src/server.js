import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

try {
  await pool.query('SELECT 1');
  const server = createApp(pool).listen(config.port, '0.0.0.0', () => {
    console.log(`SIMPASCA API listening on port ${config.port}`);
  });
  const shutdown = () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(async () => {
      await pool.end();
      clearTimeout(timeout);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error('Database connection failed:', error.message);
  await pool.end();
  process.exitCode = 1;
}