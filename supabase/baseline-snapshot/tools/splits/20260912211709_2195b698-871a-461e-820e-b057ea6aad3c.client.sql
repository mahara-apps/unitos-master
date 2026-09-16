-- Client half of split migration 80.
-- The original statement only configures the MASTER resume cron and is intentionally
-- a no-op on Client databases. Keeping an explicit fragment preserves ordered ledger
-- identity without introducing Control Plane objects.
SELECT 1;
