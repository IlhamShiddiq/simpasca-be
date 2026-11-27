-- Roles follow the SKPL (KF-01): PETUGAS and SUPERADMIN only. The seeded 'admin' becomes SUPERADMIN.
UPDATE users SET role = CASE WHEN lower(role) IN ('admin', 'superadmin') THEN 'SUPERADMIN' ELSE 'PETUGAS' END
WHERE role NOT IN ('PETUGAS', 'SUPERADMIN');
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('PETUGAS', 'SUPERADMIN'));

-- Soft delete (SKPL §3.4): deleted disasters and items stay traceable from shipments and stock history (AC-18).
ALTER TABLE disasters ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE inventory_items ADD COLUMN deleted_at TIMESTAMPTZ;

-- The API now writes STOK_AWAL itself; give older items without one their opening stock (AB-02).
INSERT INTO stock_movements (item_id, movement_type, quantity_in, quantity_out, movement_date, notes, created_by)
SELECT i.id, 'STOK_AWAL', i.initial_stock, 0, CURRENT_DATE, 'Stok awal (migrasi)', i.created_by
FROM inventory_items i
WHERE i.initial_stock > 0
  AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.item_id = i.id AND m.movement_type = 'STOK_AWAL');
