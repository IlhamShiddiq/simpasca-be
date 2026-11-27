import { resources, outputFields } from './resource-definitions.js';

function fieldSchema(field) {
  const nullable = field.nullable ? { nullable: true } : {};
  switch (field.type) {
    case 'id': return { type: 'integer', minimum: 1, maximum: 2147483647, ...nullable };
    case 'integer': return { type: 'integer', minimum: field.min ?? 0, maximum: 2147483647, ...nullable };
    case 'decimal': return { type: 'string', description: `Desimal, maksimal ${15 - field.scale} digit integer dan ${field.scale} desimal${field.positive ? ', wajib positif' : ''}.`, ...nullable };
    case 'date': return { type: 'string', format: 'date', ...nullable };
    case 'timestamp': return { type: 'string', format: 'date-time', ...nullable };
    case 'json': return { type: 'object', additionalProperties: true, ...nullable };
    case 'password': return { type: 'string', format: 'password', writeOnly: true, minLength: field.min, maxLength: field.max };
    case 'enum': return { type: 'string', enum: field.values };
    case 'lines': return {
      type: 'array', minItems: 1, maxItems: 100, writeOnly: true,
      description: 'Barang yang dikirim; tiap barang sekali. Stok dikurangi (PENGIRIMAN) dalam transaksi yang sama. Pada PATCH menggantikan seluruh daftar barang; selisih dicatat sebagai KOREKSI.',
      items: { type: 'object', additionalProperties: false, required: ['item_id', 'quantity'], properties: {
        item_id: { type: 'integer', minimum: 1 }, quantity: { type: 'integer', minimum: 1 },
      } },
    };
    default: return { type: 'string', minLength: 1, maxLength: field.max, ...nullable };
  }
}

export function addResourceDocs(openapi) {
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const content = (schema) => ({ 'application/json': { schema } });
  const response = (description, schema) => ({ description, ...(schema ? { content: content(schema) } : {}) });
  const wrap = (schema) => ({ type: 'object', required: ['data'], properties: { data: schema } });
  const errors = Object.fromEntries([400, 404, 409, 413, 422, 500].map((status) => [status, response('Request gagal; lihat message.', ref('Error'))]));
  for (const resource of resources) {
    const name = resource.table.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
    const writable = Object.entries(resource.fields).filter(([, field]) => !field.readOnly);
    const properties = Object.fromEntries(writable.map(([key, field]) => [key, fieldSchema(field)]));
    openapi.tags.push({ name: resource.name, description: resource.readOnly
      ? 'Hanya baca: ditulis oleh API sendiri sebagai bagian dari operasi lain.'
      : resource.appendOnly ? 'Riwayat append-only: buat, daftar, dan detail; tidak dapat diubah/dihapus.' : 'CRUD dan paginasi.' });
    openapi.components.schemas[name] = {
      type: 'object', properties: Object.fromEntries(Object.entries(outputFields(resource)).map(([key, field]) => [key, fieldSchema(field)])),
    };
    openapi.components.schemas[`Create${name}`] = {
      type: 'object', additionalProperties: false, properties,
      required: writable.filter(([, field]) => !field.optional).map(([key]) => key),
    };
    openapi.components.schemas[`Update${name}`] = {
      type: 'object', additionalProperties: false, minProperties: 1,
      properties: Object.fromEntries(Object.entries(properties).filter(([key]) => !resource.fields[key].immutable)),
    };
    const tags = [resource.name];
    const parameters = [
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 2147483647, default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      ...resource.filters.map((key) => ({ name: key, in: 'query', schema: fieldSchema(resource.fields[key]) })),
    ];
    // Reads are public (transparency) except accounts; writes always need a token.
    const readSecurity = resource.path === 'users' ? undefined : [{ bearerAuth: [] }, {}];
    openapi.paths[`/api/${resource.path}`] = {
      get: {
        tags, operationId: `list${name}`, summary: `Daftar ${resource.name}`, parameters,
        ...(readSecurity && { security: readSecurity }),
        description: 'Filter exact-match. Urutan id DESC. Parameter tidak dikenal atau berulang ditolak. Data soft-deleted tidak ditampilkan.',
        responses: { ...errors, 200: response('Daftar dan paginasi', {
          type: 'object', required: ['data', 'meta'], properties: {
            data: { type: 'array', items: ref(name) }, meta: openapi.components.schemas.CashTransactionList.properties.meta,
          },
        }) },
      },
      post: {
        tags, operationId: `create${name}`, summary: `Buat ${resource.name}`,
        requestBody: { required: true, content: content(ref(`Create${name}`)) },
        responses: { ...errors, 201: { ...response('Data dibuat', wrap(ref(name))), headers: { Location: { schema: { type: 'string' }, description: 'URL detail data' } } } },
      },
    };
    const detail = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: fieldSchema({ type: 'id' }) }],
      get: { tags, operationId: `get${name}`, summary: `Detail ${resource.name}`, ...(readSecurity && { security: readSecurity }), responses: { ...errors, 200: response('Detail data', wrap(ref(name))) } },
    };
    if (resource.readOnly) delete openapi.paths[`/api/${resource.path}`].post;
    if (!resource.appendOnly && !resource.readOnly) {
      detail.patch = {
        tags, operationId: `update${name}`, summary: `Ubah ${resource.name}`,
        requestBody: { required: true, content: content(ref(`Update${name}`)) },
        responses: { ...errors, 200: response('Data diperbarui', wrap(ref(name))) },
      };
      detail.delete = {
        tags, operationId: `delete${name}`, summary: `${resource.softDelete ? 'Soft delete' : 'Hapus'} ${resource.name}`,
        description: resource.softDelete ? 'Soft delete: data tidak tampil lagi, riwayat terkait tetap tersimpan. Tercatat di audit log.' : 'Ditolak dengan 409 jika masih dirujuk data lain. Tercatat di audit log.',
        responses: { ...errors, 204: response('Data dihapus; tanpa body') },
      };
    }
    openapi.paths[`/api/${resource.path}/{id}`] = detail;
  }
}