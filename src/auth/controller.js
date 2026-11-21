export function createController(service) {
  return {
    login: async (req, res) => {
      res.set('Cache-Control', 'no-store').json({ data: await service.login(req.body) });
    },
    me: async (req, res) => res.set('Cache-Control', 'no-store').json({ data: req.auth.user }),
    logout: async (req, res) => {
      await service.logout(req.auth);
      res.set('Cache-Control', 'no-store').status(204).end();
    },
  };
}