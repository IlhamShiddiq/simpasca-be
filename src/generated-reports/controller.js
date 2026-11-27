export function createController(service) {
  return {
    list: async (req, res) => res.json(await service.list(req.query, req.auth?.user ?? null)),
    find: async (req, res) => res.json({ data: await service.find(req.params.id, req.auth?.user ?? null) }),
    create: async (req, res) => {
      const data = await service.create(req.body, req.auth?.user ?? null);
      res.location(`/api/generated-reports/${data.id}`).status(201).json({ data });
    },
  };
}
