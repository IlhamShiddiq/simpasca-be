export function createController(service) {
  return {
    list: async (req, res) => res.json(await service.list(req.query, req.auth?.user ?? null)),
    find: async (req, res) => res.json({ data: await service.find(req.params.id, req.auth?.user ?? null) }),
    create: async (req, res) => {
      const data = await service.create(req.body, req.auth?.user ?? null);
      res.location(`/api/stock-receipts/${data.id}`).status(201).json({ data });
    },
    update: async (req, res) => res.json({ data: await service.update(req.params.id, req.body, req.auth?.user ?? null) }),
    remove: async (req, res) => {
      await service.remove(req.params.id, req.auth?.user ?? null);
      res.status(204).end();
    },
  };
}
