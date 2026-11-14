import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ ...config.database, connectionTimeoutMillis: 5000 });
pool.on('error', (error) => console.error('Unexpected database pool error:', error));