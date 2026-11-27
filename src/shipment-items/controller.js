export function createController(service) {
  return {
    list: async (req, res) => res.json(await service.list(req.query, req.auth?.user ?? null)),
    find: async (req, res) => res.json({ data: await service.find(req.params.id, req.auth?.user ?? null) }),
  };
}
