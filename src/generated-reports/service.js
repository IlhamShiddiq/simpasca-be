import { HttpError } from '../errors.js';
import { actorOf, withoutClientFields } from '../shared/domain.js';
import { positiveId, validateBody, validateQuery } from './validation.js';

function found(row) {
  if (!row) throw new HttpError(404, 'Laporan tidak ditemukan.');
  return row;
}

export function createService(repository) {
  return {
    async list(query) {
      const filters = validateQuery(query);
      const { data, total } = await repository.list(filters);
      return { data, meta: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) } };
    },
    async find(id) { return found(await repository.find(positiveId(id))); },
    /**
     * Saves one disaster's snapshot as its author and writes GENERATE_LAPORAN to the
     * audit log in the same transaction; stock and cash are untouched (AB-05, AC-32).
     */
    async create(body, actor) {
      const { id: userId, name } = actorOf(actor);
      const data = validateBody({
        ...withoutClientFields(body, ['generated_by', 'generated_by_name']), generated_by: userId, generated_by_name: name,
      });
      return repository.transaction(async (tx) => {
        if (!(await tx.liveDisaster(data.disaster_id))) throw new HttpError(422, 'Bencana tidak ditemukan atau sudah dihapus.');
        const report = await tx.create(data);
        await tx.audit({
          userId, action: 'GENERATE_LAPORAN', entityType: 'disasters', entityId: data.disaster_id,
          after: { report_id: report.id, disaster_id: data.disaster_id },
        });
        return report;
      });
    },
  };
}
