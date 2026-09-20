#!/usr/bin/env python3
"""Compara evidências exportadas; não acessa rede nem banco."""
from __future__ import annotations
import argparse, json, re
from pathlib import Path
SHA=re.compile(r'^[0-9a-f]{40,64}$')
def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--evidence',required=True); a=ap.parse_args()
 evidence=json.loads(Path(a.evidence).read_text()); local=evidence.get('local') or {}; control=evidence.get('controlPlane') or {}; production=evidence.get('production') or {}
 required={'local.release':local.get('release'),'local.commitSha':local.get('commitSha'),'local.packageSha256':local.get('packageSha256'),'controlPlane.desiredRelease':control.get('desiredRelease'),'controlPlane.desiredCommitSha':control.get('desiredCommitSha'),'controlPlane.currentVersion':control.get('currentVersion'),'production.release':production.get('release'),'production.commitSha':production.get('commitSha')}
 missing=sorted(k for k,v in required.items() if not isinstance(v,str) or not v.strip())
 divergences=[]
 if not missing:
  pairs=[('release local × desejada',local['release'],control['desiredRelease']),('commit local × desejado',local['commitSha'].lower(),control['desiredCommitSha'].lower()),('release desejada × produção',control['desiredRelease'],production['release']),('commit desejado × produção',control['desiredCommitSha'].lower(),production['commitSha'].lower()),('versão aplicada × produção',control['currentVersion'],production['release'])]
  divergences=[{'field':n,'left':x,'right':y} for n,x,y in pairs if x!=y]
 if local.get('packageSha256') and not re.fullmatch(r'[0-9a-f]{64}',str(local['packageSha256'])): divergences.append({'field':'SHA-256 local','left':local.get('packageSha256'),'right':'64 hex minúsculos'})
 result={'status':'PASS' if not missing and not divergences else 'BLOCK','missing':missing,'divergences':divergences,'evidence':required}
 print(json.dumps(result,ensure_ascii=False,sort_keys=True))
 return 0 if result['status']=='PASS' else 2
if __name__=='__main__': raise SystemExit(main())
