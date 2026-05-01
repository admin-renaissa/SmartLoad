-- Enforce at most one purchase order per non-null Tally voucher id (import idempotency).
-- Multiple NULLs remain allowed in PostgreSQL.
CREATE UNIQUE INDEX "purchase_orders_tallyVoucherId_key" ON "purchase_orders"("tallyVoucherId");
