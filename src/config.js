import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  database: process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT || 5432),
        database: process.env.POSTGRES_DB || 'simpasca',
        user: process.env.POSTGRES_USER || 'simpasca',
        password: process.env.POSTGRES_PASSWORD,
      },
};