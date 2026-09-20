\set ON_ERROR_STOP on
\ir 001_control_plane_convergence_v1_4_3.sql
\ir ../migrations/20260917184500_legacy_migration_reconciliation.sql
\ir ../migrations/20260917190721_f04a7c59-5fbb-4ef3-aa75-044844da8fa3.sql
\ir 002_control_plane_global_freeze.sql
\ir 003_control_plane_deterministic_update.sql