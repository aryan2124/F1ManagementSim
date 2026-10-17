import sys, json, numpy as np, cv2
from scene_lib import *
names = json.load(open('/tmp/sat/names.json')); geo = json.load(open('/tmp/scenes/geo.json'))
P = json.load(open('scene-params.json'))
def conv(par_, w):
    if w == par_['w']: return par_
    if w == 'b': return dict(w='b', s=par_['s'] * 2, cx=(par_['cx'] - 640) / 2 + 640, cy=(par_['cy'] - 640) / 2 + 640)
    return dict(w='a', s=par_['s'] / 2, cx=(par_['cx'] - 640) * 2 + 640, cy=(par_['cy'] - 640) * 2 + 640)
res = {}
for n in (sys.argv[1:] or names):
    i = names.index(n); pts = geo[n]['pts']; grid = world_grid(pts)
    L = [sample_layer(f"/tmp/sat/{w}/p-{i:03d}.jpg", conv(P[n], w), pts, grid) for w in 'ab']
    (ra, ta, va), (rb, tb, vb) = L
    ov = va & vb
    ga = cv2.cvtColor((ra * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    gb = cv2.cvtColor((rb * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    ys, xs = np.where(ov)
    if len(ys) < 5000: print(n, 'little overlap'); continue
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    A = ga[y0:y1, x0:x1]; B = gb[y0:y1, x0:x1]
    A = cv2.GaussianBlur(A, (0, 0), 1.2); B = cv2.GaussianBlur(B, (0, 0), 1.2)
    A = A - A.mean(); B = B - B.mean()
    (dx, dy), resp = cv2.phaseCorrelate(A.astype(np.float64), B.astype(np.float64))
    res[n] = (round(dx, 2), round(dy, 2), round(float(resp), 3), A.shape)
    print(n, 'shift cells', res[n], flush=True)
