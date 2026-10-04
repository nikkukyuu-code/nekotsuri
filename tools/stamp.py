#!/usr/bin/env python3
"""Stamp publish time: BUILD_TIME (epoch ms) in js/data.js, ?v=YYYYMMDDHHmmss (Asia/Tokyo) cache-bust,
the auto-update PAGE_LABEL in both pages, and version.json (polled by the pages to auto-reload)."""
import re, time, pathlib, datetime, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import autoupdate as au
ms = int(time.time() * 1000)
jst = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone(datetime.timedelta(hours=9)))
v = jst.strftime('%Y%m%d%H%M%S'); label = jst.strftime('%Y-%m-%d %H:%M:%S')
d = ROOT / 'game/js/data.js'
d.write_text(re.sub(r'var BUILD_TIME = \d+;', f'var BUILD_TIME = {ms};', d.read_text()))
for p in [ROOT / 'game/index.html', ROOT / 'index.html']:
    t = p.read_text()
    t = re.sub(r'\?v=\d{14}', f'?v={v}', t)
    t = re.sub(r'(name="nk-v" content=")\d{14}', rf'\g<1>{v}', t)
    t = re.sub(r'(<span class="build">)[^<]*(</span>)', rf'\g<1>{label}\g<2>', t)
    p.write_text(t)
    au.set_label(p, label)
au.write_json(ROOT / 'version.json', label, ms)
print(ms, v, label)
