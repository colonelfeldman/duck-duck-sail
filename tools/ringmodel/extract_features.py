# Runs every training photo through the game's own on-device classifier (same model, same browser engine)
# and saves its 1000 scores per photo.  Needs the local server:  python3 -m http.server 8765 --bind 127.0.0.1
#   python3 tools/ringmodel/extract_features.py <data_dir>      → <data_dir>/features.npz
import base64, glob, os, sys
import numpy as np
from playwright.sync_api import sync_playwright

DATA = sys.argv[1]
BASE = os.environ.get('DDS_BASE', 'http://127.0.0.1:8765/index.html')

JS_INIT = """async () => {
  const base = new URL('vendor/mediapipe/', location.href).href;
  const vision = await import(base + 'vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
  window.__clf = await vision.ImageClassifier.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL('vendor/models/efficientnet_lite0.tflite', location.href).href, delegate: 'CPU' },
    runningMode: 'IMAGE', maxResults: -1, scoreThreshold: 0 });
  return true; }"""
JS_RUN = """async (src) => {
  const img = new Image(); img.src = src; await img.decode();
  const cats = window.__clf.classify(img).classifications[0].categories;
  const v = new Array(1000).fill(0); for (const c of cats) v[c.index] = c.score;
  return [v, cats.slice().sort((a,b)=>a.index-b.index).map(c => c.categoryName)]; }"""

files = [(f, 1) for f in sorted(glob.glob(os.path.join(DATA, 'pos', '*.jpg')))] + \
        [(f, 0) for f in sorted(glob.glob(os.path.join(DATA, 'neg', '*.jpg')))]
X, y, names, labels = [], [], [], None
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(BASE); pg.wait_for_timeout(300)
    pg.evaluate(JS_INIT)
    for i, (f, lab) in enumerate(files):
        src = 'data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
        try:
            v, lbl = pg.evaluate(JS_RUN, src)
        except Exception as e:
            print('skip', f, str(e)[:80]); continue
        labels = labels or lbl
        X.append(v); y.append(lab); names.append(os.path.relpath(f, DATA))
        if i % 50 == 0: print(f'{i}/{len(files)}')
    b.close()
np.savez(os.path.join(DATA, 'features.npz'), X=np.array(X, dtype=np.float32), y=np.array(y), names=np.array(names), labels=np.array(labels))
print('saved', len(X), 'feature vectors;', sum(y), 'positive')
