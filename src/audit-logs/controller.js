export function createController(service) {
  return {
    list: async (req, res) => res.json(await service.list(req.query)),
    find: async (req, res) => res.json({ data: await service.find(req.params.id) }),
    create: async (req, res) => {
      const data = await service.create(req.body);
      res.location(`/api/audit-logs/${data.id}`).status(201).json({ data });
    },
  };
}
