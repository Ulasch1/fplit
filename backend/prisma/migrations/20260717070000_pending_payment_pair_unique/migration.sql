-- Enforce at most one PENDING_CONFIRMATION payment per (group, from_user, to_user).
-- Backs the app-level 409 duplicate-send check with a DB-level guarantee (race-safe).
CREATE UNIQUE INDEX "payments_pending_pair_unique"
  ON "payments" ("group_id", "from_user", "to_user")
  WHERE "status" = 'PENDING_CONFIRMATION';
