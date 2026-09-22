#!/usr/bin/env python3
"""Gera o inventário selado dos objetos Master-only, sem rede."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'master'/'control-plane-contract.json'
FILES=[ROOT/'master'/'002_control_plane_global_freeze.sql',ROOT/'master'/'global-freeze-install-preflight.sql',ROOT/'master'/'003_control_plane_deterministic_update.sql',ROOT/'master'/'deterministic-update-install-preflight.sql',ROOT/'master'/'install-deterministic-update.sql',ROOT/'master'/'004_control_plane_release_promotion.sql',ROOT/'master'/'install-control-plane-release.sql',ROOT/'master'/'005_activate_cron_37.sql',ROOT/'master'/'006_clean_installation_replacement.sql']
TABLES=['installation_operations_freeze','installation_operations_freeze_events','control_plane_release_state','control_plane_release_events']
FUNCTIONS=['read_installation_operations_freeze()','set_installation_operations_freeze(boolean,text,text,bigint)','guard_installation_operations_freeze()','finalize_installation_operation(uuid,text,bigint,text,text,text,jsonb,jsonb,text,text,jsonb,text,boolean,boolean)','normalize_legacy_installation_operations(integer)','promote_control_plane_release(bigint,text,text,text,text,text,text,jsonb,text)','prepare_clean_installation_replacement_cutover(uuid,text)']
TRIGGERS=[f'installation_operations_freeze_guard@{x}' for x in ['installations','installation_credentials','installation_operations','installation_operation_attempts','installation_operation_steps','installation_operation_outbox','installation_operation_migrations','installation_migration_reconciliation_evidence']]
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def build():
 d={'schemaVersion':1,'releaseVersion':'1.4.25','files':{p.name:sha(p) for p in FILES},'tables':TABLES,'functions':FUNCTIONS,'triggers':TRIGGERS}
 return json.dumps(d,indent=2,sort_keys=True)+'\n'
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--check',action='store_true'); a=ap.parse_args(); data=build()
 if a.check:
  if not OUT.is_file() or OUT.read_text()!=data: raise SystemExit('inventário Control-plane ausente ou divergente')
  print('inventário Control-plane e hashes conferem')
 else: OUT.write_text(data); print(f'inventário Control-plane -> {OUT}')
if __name__=='__main__': main()
