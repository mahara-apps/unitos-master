#!/usr/bin/env python3
"""Compara inventário exportado do Control-plane com o contrato local selado."""
from __future__ import annotations
import argparse, json
from pathlib import Path
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--report',required=True); ap.add_argument('--contract',default='supabase/master/control-plane-contract.json'); a=ap.parse_args()
 expected=json.loads(Path(a.contract).read_text()); observed=json.loads(Path(a.report).read_text()); missing={}
 for key in ('tables','functions','triggers'):
  want=set(expected.get(key,[])); got=set(observed.get(key,[])); absent=sorted(want-got); extra=sorted(got-want)
  if absent or extra: missing[key]={'missing':absent,'unexpected':extra}
 hashes={k:{'expected':v,'observed':(observed.get('files') or {}).get(k)} for k,v in expected.get('files',{}).items() if (observed.get('files') or {}).get(k)!=v}
 result={'status':'PASS' if not missing and not hashes else 'BLOCK','objects':missing,'hashes':hashes}
 print(json.dumps(result,ensure_ascii=False,sort_keys=True)); return 0 if result['status']=='PASS' else 2
if __name__=='__main__': raise SystemExit(main())
