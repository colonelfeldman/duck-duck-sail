# Trains the life-ring recognizer: logistic regression on log-scores from the game's classifier.
#   python3 tools/ringmodel/train.py <data_dir>   → prints held-out accuracy, writes js/lifering-model.js
import json, os, sys
import numpy as np

DATA = sys.argv[1]
OUT_JS = os.path.join(os.path.dirname(__file__), '..', '..', 'js', 'lifering-model.js')
d = np.load(os.path.join(DATA, 'features.npz'), allow_pickle=True)
X_raw, y, names, labels = d['X'], d['y'].astype(float), d['names'], list(d['labels'])
feat = lambda P: np.log(P + 1e-4)
X = feat(X_raw)
mu, sd = X.mean(0), X.std(0) + 1e-6

def fit(X, y, l2=0.05, iters=3000, lr=0.1):
    Xs = (X - mu) / sd
    n, k = Xs.shape
    w, b = np.zeros(k), 0.0
    cw = np.where(y == 1, 0.5 / max(y.mean(), 1e-6), 0.5 / max(1 - y.mean(), 1e-6))   # balance classes
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(Xs @ w + b)))
        g = (p - y) * cw
        w -= lr * (Xs.T @ g / n + l2 * w)
        b -= lr * g.mean()
    return w, b

def predict(w, b, X):
    return 1 / (1 + np.exp(-(((X - mu) / sd) @ w + b)))

# 5-fold cross-validation (stratified), to see how it does on photos it never trained on
rng = np.random.default_rng(7)
folds = np.zeros(len(y), int)
for cls in (0, 1):
    idx = np.where(y == cls)[0]; rng.shuffle(idx)
    folds[idx] = np.arange(len(idx)) % 5
P = np.zeros(len(y))
for f in range(5):
    tr, te = folds != f, folds == f
    w, b = fit(X[tr], y[tr]); P[te] = predict(w, b, X[te])

print(f'photos: {int(y.sum())} life rings, {int((1 - y).sum())} other')
print('held-out results (5-fold cross-validation):')
best = None
for t in (0.5, 0.6, 0.7, 0.8, 0.9, 0.95):
    pred = P >= t
    tp = int((pred & (y == 1)).sum()); fp = int((pred & (y == 0)).sum()); fn = int((~pred & (y == 1)).sum())
    prec = tp / max(tp + fp, 1); rec = tp / max(tp + fn, 1)
    print(f'  threshold {t:.2f}: catches {rec:5.1%} of real life rings, {fp:3d} false alarms out of {int((1-y).sum())} other photos (precision {prec:.1%})')
    if best is None and prec >= 0.95: best = t
best = best or 0.9
# hardest mistakes, for a look
order = np.argsort(-P)
fps = [(names[i], round(float(P[i]), 2)) for i in order if y[i] == 0][:8]
fns = [(names[i], round(float(P[i]), 2)) for i in np.argsort(P) if y[i] == 1][:8]
print('most life-ring-like non-rings:', fps)
print('least life-ring-like real rings:', fns)

w, b = fit(X, y)
# fold the standardisation into the weights so the app does one dot product:  z = w·log(p+1e-4) + b
w_app = w / sd; b_app = b - float((mu / sd) @ w)
model = {'labelsCheck': [labels[0], labels[1], labels[999]], 'w': [round(float(v), 5) for v in w_app], 'b': round(float(b_app), 5),
         'threshold': best, 'eps': 1e-4, 'trainedOn': {'pos': int(y.sum()), 'neg': int((1 - y).sum())}}
with open(OUT_JS, 'w') as f:
    f.write('// Life-ring recognizer: logistic regression on the classifier\'s 1000 log-scores.\n')
    f.write('// Trained by tools/ringmodel/train.py on Wikimedia Commons photos. Do not edit by hand.\n')
    f.write('const LIFERING_MODEL = ' + json.dumps(model) + ';\n')
print(f'wrote {OUT_JS} (threshold {best})')
