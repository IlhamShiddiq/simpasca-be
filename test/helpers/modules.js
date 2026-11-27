// HTTP expectations independent of application registration and Swagger metadata.
export const modules = [
  {
    "path": "users",
    "filters": [
      "username",
      "role"
    ],
    "appendOnly": false
  },
  {
    "path": "disasters",
    "filters": [
      "status",
      "disaster_type",
      "province",
      "regency_city",
      "created_by"
    ],
    "appendOnly": false
  },
  {
    "path": "inventory-items",
    "filters": [
      "category",
      "stock_unit",
      "need_type",
      "created_by"
    ],
    "appendOnly": false
  },
  {
    "path": "shipments",
    "filters": [
      "disaster_id",
      "status",
      "created_by"
    ],
    "appendOnly": false
  },
  {
    "path": "shipment-items",
    "filters": [
      "shipment_id",
      "item_id"
    ],
    "appendOnly": false,
    "readOnly": true
  },
  {
    "path": "stock-receipts",
    "filters": [
      "item_id",
      "item_condition",
      "created_by"
    ],
    "appendOnly": false
  },
  {
    "path": "stock-movements",
    "filters": [
      "item_id",
      "disaster_id",
      "receipt_id",
      "shipment_item_id",
      "movement_type",
      "created_by"
    ],
    "appendOnly": true,
    "readOnly": true
  },
  {
    "path": "generated-reports",
    "filters": [
      "disaster_id",
      "generated_by"
    ],
    "appendOnly": true
  },
  {
    "path": "audit-logs",
    "filters": [
      "user_id",
      "action",
      "entity_type",
      "entity_id"
    ],
    "appendOnly": true,
    "readOnly": true
  }
];
