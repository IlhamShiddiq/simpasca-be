import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  corsOrigins: process.env.CORS_ORIGINS ?? '',
  auth: {
    secret: process.env.JWT_SECRET,
    expiresIn: Number(process.env.JWT_EXPIRES_IN_SECONDS || 3600),
    issuer: 'simpasca-api',
    audience: 'simpasca-client',
  },
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