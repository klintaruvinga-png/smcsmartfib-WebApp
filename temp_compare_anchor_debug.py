import json
from pathlib import Path

mt5 = json.loads(Path('reports/phase4-parity/mt5-anchor-debug.json').read_text())
pine = json.loads(Path('reports/phase4-parity/pine-anchor-debug.json').read_text())

pine_map = {f"{r['symbol']}|{r['timeframe']}|{r['family']}": r for r in pine}
for r in mt5:
    key = f"{r['symbol']}|{r['timeframe']}|{r['family']}"
    other = pine_map.get(key)
    if other is None:
        continue
    dh = abs(r['anchor_high'] - other['anchor_high'])
    dl = abs(r['anchor_low'] - other['anchor_low'])
    if dh > 1e-8 or dl > 1e-8:
        print(f"{key} diff-high={dh:.8f} low={dl:.8f} lineage={r.get('candle_lineage','')} source={r.get('source','')}")
