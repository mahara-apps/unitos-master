\set ON_ERROR_STOP on
\ir 001_control_plane_convergence_v1_4_3.sql
\ir ../migrations/20260917184500_legacy_migration_reconciliation.sql
\ir ../migrations/20260917191500_legacy_update_p0_hardening.sql