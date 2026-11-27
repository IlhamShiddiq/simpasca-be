-- Links cash to the rest of the system: the disaster money is for, and the stock receipt an expense paid for.
-- Both are optional, so general income and expenses keep working.
ALTER TABLE cash_transactions
  ADD COLUMN disaster_id INTEGER REFERENCES disasters(id) ON DELETE RESTRICT,
  ADD COLUMN receipt_id INTEGER REFERENCES stock_receipts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT cash_transactions_receipt_expense_check CHECK (receipt_id IS NULL OR type = 'expense');

CREATE INDEX cash_transactions_disaster_id_idx ON cash_transactions (disaster_id);
CREATE INDEX cash_transactions_receipt_id_idx ON cash_transactions (receipt_id);
