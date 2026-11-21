export function requireAuth(service) {
  return async (req, res, next) => {
    req.auth = await service.authenticate(req.get('authorization'));
    next();
  };
}