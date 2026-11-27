import { HttpError } from '../errors.js';

export function requireAuth(service) {
  return async (req, res, next) => {
    req.auth = await service.authenticate(req.get('authorization'));
    next();
  };
}

/** Paths a visitor may not read even though reads are public: accounts and their audit trail. */
const PRIVATE_READS = /^\/users(\/|$)/;

/**
 * Public transparency: GET without a token is allowed and runs with req.auth = null;
 * every write, and every request that sends a token, is authenticated.
 */
export function authenticateApi(service) {
  return async (req, res, next) => {
    const header = req.get('authorization');
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    if (!header && isRead && !PRIVATE_READS.test(req.path)) {
      req.auth = null;
      return next();
    }
    req.auth = await service.authenticate(header);
    next();
  };
}

/** Account management is limited to SUPERADMIN (KF-01.4); reads stay open to signed-in staff. */
export function requireSuperadminForWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (req.auth?.user?.role !== 'SUPERADMIN') {
    throw new HttpError(403, 'Hanya superadmin yang dapat mengelola akun.');
  }
  next();
}
