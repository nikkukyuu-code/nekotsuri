#!/usr/bin/env python3
"""Stamp publish time: BUILD_TIME (epoch ms) in js/data.js and ?v=YYYYMMDDHHmmss (Asia/Tokyo) cache-bust."""
import re, time, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parents[1]
ms = int(time.time() * 1000)
jst = datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone(datetime.timedelta(hours=9)))
v = jst.strftime('%Y%m%d%H%M%S')
d = ROOT / 'game/js/data.js'
d.write_text(re.sub(r'var BUILD_TIME = \d+;', f'var BUILD_TIME = {ms};', d.read_text()))
for p in [ROOT / 'game/index.html', ROOT / 'index.html']:
    if p.exists():
        t = p.read_text()
        t = re.sub(r'\?v=\d{14}', f'?v={v}', t)
        t = re.sub(r'(name="nk-v" content=")\d{14}', rf'\g<1>{v}', t)
        t = re.sub(r'(<span class="build">)[^<]*(</span>)', rf'\g<1>{jst.strftime("%Y-%m-%d %H:%M:%S")}\g<2>', t)
        p.write_text(t)
print(ms, v, jst.strftime('%Y-%m-%d %H:%M:%S'))
