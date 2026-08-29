#!/usr/bin/env bash
# =============================================================================
# Gera supabase/baseline-snapshot/001_initial_schema.sql a partir do ESTADO REAL
# do banco, por dump estrutural (NUNCA por replay das 250 migrations).
#
# Uso:
#   bash supabase/baseline-snapshot/tools/dump_schema.sh "<POSTGRES_URL>"
#
# <POSTGRES_URL>: connection string do banco de ORIGEM (producao), somente
# leitura por natureza — pg_dump nao escreve nada. Nenhum dado e exportado:
# --schema-only garante snapshot estrutural puro.
#
# Requer pg_dump >= 15 (mesma major do servidor Supabase).
# =============================================================================
set -euo pipefail

DB_URL="${1:?informe a connection string do banco de origem}"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$OUT_DIR/001_initial_schema.sql"

pg_dump "$DB_URL" \
  --schema-only \
  --no-owner \
  --schema=public \
  --exclude-table='public.brain_events_archive*' \
  --file="$OUT.raw"

# Cabecalho + normalizacoes minimas (sem alterar semantica):
{
  cat <<'HDR'
-- =============================================================================
-- 001_initial_schema.sql — SNAPSHOT ESTRUTURAL DO ESTADO ATUAL APROVADO
-- Gerado por pg_dump --schema-only. NAO e replay das 250 migrations historicas,
-- que permanecem preservadas em supabase/migrations/ (e no Git).
--
-- Contem: extensoes (inclui vector/pgvector, pg_cron, pg_net, supabase_vault),
-- enums atuais (app_role preserva os labels reais, incluindo editor/designer),
-- tabelas e colunas, PK/FK/UNIQUE/CHECK, indices, funcoes/RPCs, triggers,
-- RLS + policies atuais, matview brain_stats_mv, GRANTs.
--
-- NAO contem: DML de seed/backfill, dados de producao, objetos removidos
-- (brain_events_archive, particoes do Brain, brain_knowledge, meta_connections,
-- meta_oauth_states, CRM), cron jobs, buckets de Storage.
-- Esses itens ficam em 002_bootstrap_cron.sql, 003_storage_buckets.sql e
-- 004_seeds.sql.
--
-- ATENCAO: pg_dump --schema=public NAO inclui o trigger on_auth_user_created
-- em auth.users (schema reservado). Aplique-o manualmente apos o snapshot:
--   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- =============================================================================
HDR
  # remove apenas comandos de sessao do pg_dump; nenhuma DDL e alterada
  grep -v -E "^(SET |SELECT pg_catalog\.set_config)" "$OUT.raw"
} > "$OUT"

rm -f "$OUT.raw"
echo "gerado: $OUT ($(wc -l < "$OUT") linhas)"

cat <<'NEXT'

Proximo passo (NAO aplicar em producao):
  1. criar projeto Supabase descartavel
  2. psql "<URL_DESCARTAVEL>" -f 001_initial_schema.sql
  3. psql "<URL_DESCARTAVEL>" -f 003_storage_buckets.sql
  4. ajustar APP_URL e aplicar 002_bootstrap_cron.sql (ou manter jobs inativos)
  5. comparar contagens com a tabela do README.md e relatar divergencias
NEXT
