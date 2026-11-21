// Identifiers in these definitions are trusted code, never request input.
const text = (max, options = {}) => ({ type: 'text', max, ...options });
const id = (options = {}) => ({ type: 'id', ...options });
const decimal = (scale, options = {}) => ({ type: 'decimal', scale, ...options });
const date = (options = {}) => ({ type: 'date', ...options });
const timestamp = (options = {}) => ({ type: 'timestamp', ...options });
const creator = () => id({ immutable: true });
const requestKey = () => text(100, { immutable: true });
const optionalText = (max = 5000) => text(max, { optional: true, nullable: true });

export const resources = [
  {
    path: 'users', table: 'users', name: 'Users', timestamps: true,
    filters: ['username', 'role'],
    fields: {
      name: text(150), username: text(100), password: { type: 'password', min: 12, max: 256 }, role: text(50),
    },
  },
  {
    path: 'disasters', table: 'disasters', name: 'Disasters',
    filters: ['status', 'disaster_type', 'province', 'regency_city', 'created_by'],
    fields: {
      disaster_type: text(100), province: text(150), regency_city: text(150),
      latitude: decimal(7, { optional: true, nullable: true, min: -90, max: 90, digits: 3, signed: true }),
      longitude: decimal(7, { optional: true, nullable: true, min: -180, max: 180, digits: 3, signed: true }),
      location_details: optionalText(), status: text(50), handling_scale: text(50), occurred_at: timestamp(),
      affected_people: { type: 'integer', optional: true, min: 0 },
      affected_households: { type: 'integer', optional: true, min: 0 },
      impact_notes: optionalText(), created_by: creator(),
    },
  },
  {
    path: 'inventory-items', table: 'inventory_items', name: 'Inventory Items',
    filters: ['category', 'stock_unit', 'need_type', 'created_by'],
    fields: {
      name: text(150), category: text(100), stock_unit: text(50),
      initial_stock: decimal(3, { optional: true, min: 0 }),
      need_ratio: decimal(6, { optional: true, nullable: true, positive: true }),
      need_type: optionalText(50), ratio_basis: optionalText(50),
      expiration_date: date({ optional: true, nullable: true }), created_by: creator(),
    },
  },
  {
    path: 'shipments', table: 'shipments', name: 'Shipments', timestamps: true, softDelete: true,
    filters: ['disaster_id', 'status', 'created_by'],
    fields: {
      disaster_id: id(), status: text(50),
      shipped_at: timestamp({ optional: true, nullable: true }),
      received_at: timestamp({ optional: true, nullable: true }),
      destination: text(5000), person_in_charge: text(150), request_key: requestKey(), created_by: creator(),
    },
  },
  {
    path: 'shipment-items', table: 'shipment_items', name: 'Shipment Items', softDelete: true,
    filters: ['shipment_id', 'item_id'],
    fields: { shipment_id: id({ immutable: true }), item_id: id({ immutable: true }), quantity: decimal(3, { positive: true }) },
  },
  {
    path: 'stock-receipts', table: 'stock_receipts', name: 'Stock Receipts', timestamps: true, softDelete: true,
    filters: ['item_id', 'item_condition', 'created_by'],
    fields: {
      item_id: id({ immutable: true }), quantity: decimal(3, { positive: true }), receipt_date: date(),
      source_giver: text(150), item_condition: text(100), notes: optionalText(),
      request_key: requestKey(), created_by: creator(),
    },
  },
  {
    path: 'stock-movements', table: 'stock_movements', name: 'Stock Movements', appendOnly: true, createdAt: true,
    filters: ['item_id', 'disaster_id', 'receipt_id', 'shipment_item_id', 'movement_type', 'created_by'],
    fields: {
      item_id: id(), disaster_id: id({ optional: true, nullable: true }),
      receipt_id: id({ optional: true, nullable: true }), shipment_item_id: id({ optional: true, nullable: true }),
      movement_type: text(50), quantity_in: decimal(3, { optional: true, min: 0 }),
      quantity_out: decimal(3, { optional: true, min: 0 }), movement_date: date(),
      notes: optionalText(), created_by: creator(),
    },
  },
  {
    path: 'generated-reports', table: 'generated_reports', name: 'Generated Reports', appendOnly: true,
    filters: ['disaster_id', 'generated_by'],
    fields: {
      disaster_id: id(), report_snapshot: { type: 'json' }, generated_by: creator(), generated_by_name: text(150),
    },
    extra: { generated_at: { type: 'timestamp' } },
  },
  {
    path: 'audit-logs', table: 'audit_logs', name: 'Audit Logs', appendOnly: true,
    filters: ['user_id', 'action', 'entity_type', 'entity_id'],
    fields: {
      user_id: id(), action: text(100), entity_type: text(100), entity_id: id(),
      before_data: { type: 'json', optional: true, nullable: true },
      after_data: { type: 'json', optional: true, nullable: true },
    },
    extra: { occurred_at: { type: 'timestamp' } },
  },
];

export function outputFields(resource) {
  return {
    id: id(),
    ...Object.fromEntries(Object.entries(resource.fields).filter(([, field]) => field.type !== 'password')),
    ...((resource.timestamps || resource.createdAt) ? { created_at: timestamp() } : {}),
    ...(resource.timestamps ? { updated_at: timestamp() } : {}),
    ...(resource.softDelete ? { deleted_at: timestamp({ nullable: true }) } : {}),
    ...resource.extra,
  };
}