export function createController(service) {
  return {
    list: async (req, res) => res.json(await service.list(req.query)),
    find: async (req, res) => res.json({ data: await service.find(req.params.id) }),
    create: async (req, res) => {
      const data = await service.create(req.body);
      res.location(`/api/users/${data.id}`).status(201).json({ data });
    },
    update: async (req, res) => res.json({ data: await service.update(req.params.id, req.body) }),
    remove: async (req, res) => {
      await service.remove(req.params.id);
      res.status(204).end();
    },
  };
}
