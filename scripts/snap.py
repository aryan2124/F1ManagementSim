"""Registers the satellite pictures to the GPS centreline. Rigid fit gets close; this finds where the real tarmac is along
the normal of every GPS point (dynamic programming keeps it from jumping to a neighbouring road), then builds a smooth
warp field so the picture is bent onto the centreline the simulation really uses.
Outputs scripts/scene-warp.json {circuit: [[x, y, dx, dy], ...]}  (metres; displacement to ADD to a GPS-space point to get where the picture shows it)"""
import sys, os, json, math, numpy as np, cv2
names = json.load(open('/tmp/sat/names.json')); geo = json.load(open('/tmp/scenes/geo.json'))
P = json.load(open(os.path.join(os.path.dirname(__file__), 'scene-params.json')))
def conv(par_, w):
    if w == par_['w']: return par_
    if w == 'b': return dict(w='b', s=par_['s'] * 2, cx=(par_['cx'] - 640) / 2 + 640, cy=(par_['cy'] - 640) / 2 + 640)
    return dict(w='a', s=par_['s'] / 2, cx=(par_['cx'] - 640) * 2 + 640, cy=(par_['cy'] - 640) * 2 + 640)
def asph(bgr):
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32); s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
    a = np.clip(1 - s / 0.30, 0, 1) * np.clip(1 - np.abs(v - 0.40) / 0.30, 0, 1)
    return cv2.GaussianBlur(a, (0, 0), 0.8)
def densify(pts, step=8.0):
    p = np.vstack([pts, pts[:1]]); seg = np.hypot(*np.diff(p, axis=0).T); d = np.concatenate([[0], np.cumsum(seg)])
    t = np.arange(0, d[-1], step); x = np.interp(t, d, p[:, 0]); y = np.interp(t, d, p[:, 1]); q = np.stack([x, y], 1)
    tg = np.roll(q, -2, 0) - np.roll(q, 2, 0); tg /= np.linalg.norm(tg, axis=1, keepdims=True) + 1e-9
    return q, np.stack([-tg[:, 1], tg[:, 0]], 1)
def snap(n, R=60.0, dstep=1.5, width=13.0):
    i = names.index(n); pts = np.array(geo[n]['pts'], np.float64); b0 = (pts.min(0) + pts.max(0)) / 2
    q, nr = densify(pts); N = len(q)
    offs = np.arange(-R, R + 1e-6, dstep); K = len(offs)
    # one cost layer per image, sampled at image px = (world - b0)/s + c
    cost = np.full((N, K), np.nan, np.float32)
    for w in ('b', 'a'):   # a overwrites b where available
        pr = conv(P[n], w); im = cv2.imread(f'/tmp/sat/{w}/p-{i:03d}.jpg'); A = asph(im); H = A.shape[0]
        sm = lambda off: ((q + nr * off) - b0) / pr['s'] + [pr['cx'], pr['cy']]
        hw = width / 2
        def samp(off):
            xy = sm(off).astype(np.float32); return cv2.remap(A, xy[:, 0:1].copy(), xy[:, 1:2].copy(), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=-1)[:, 0], xy
        # centre box mean (3 samples) and flank means
        cs = []; ok = np.ones((N, K), bool)
        for k, o in enumerate(offs):
            c = np.mean([samp(o + d)[0] for d in (-hw * 0.6, 0, hw * 0.6)], axis=0)
            fl = np.mean([samp(o - hw * 1.9)[0], samp(o - hw * 1.5)[0]], axis=0); fr = np.mean([samp(o + hw * 1.9)[0], samp(o + hw * 1.5)[0]], axis=0)
            xy = samp(o)[1]; inside = (xy[:, 0] > 30) & (xy[:, 0] < H - 30) & (xy[:, 1] > 30) & (xy[:, 1] < H - 60)
            val = c - 0.5 * np.minimum(fl, fr) - 0.2 * np.maximum(fl, fr)
            val = np.where((c < 0) | (fl < 0) | (fr < 0) | ~inside, np.nan, val)
            if w == 'b': cost[:, k] = val
            else: cost[:, k] = np.where(np.isnan(val), cost[:, k], val)
    sc = np.nan_to_num(cost, nan=-0.05)   # unseen: mildly unattractive and flat
    # prior toward the rigid fit (offset 0)
    sc = sc - (offs[None, :] / R) ** 2 * 0.06
    # circular Viterbi: unroll twice
    S = np.vstack([sc, sc, sc]); M = S.shape[0]; maxj = 3
    D = np.full((M, K), -1e9, np.float32); B = np.zeros((M, K), np.int16); D[0] = S[0]
    pen = np.array([0.0] + [0.012 * j * j for j in range(1, maxj + 1)])
    for m in range(1, M):
        best = np.full(K, -1e9, np.float32); arg = np.zeros(K, np.int16)
        for j in range(-maxj, maxj + 1):
            sh = np.full(K, -1e9, np.float32)
            if j >= 0: sh[j:] = D[m - 1, :K - j] if j > 0 else D[m - 1]
            else: sh[:j] = D[m - 1, -j:]
            val = sh - pen[abs(j)]
            upd = val > best; best = np.where(upd, val, best); arg = np.where(upd, np.arange(K) - j, arg)
        D[m] = best + S[m]; B[m] = arg
    path = np.zeros(M, int); path[-1] = int(np.argmax(D[-1]))
    for m in range(M - 1, 0, -1): path[m - 1] = B[m, path[m]]
    mid = path[N:2 * N]
    o = offs[mid]
    # light smoothing along the loop
    k = 5; ker = np.ones(k) / k; o = np.convolve(np.r_[o[-k:], o, o[:k]], ker, 'same')[k:-k]
    return q, nr, o, float(np.nanmean(np.max(np.where(np.isnan(cost), -1, cost), axis=1)))
if __name__ == '__main__':
    mp = os.path.join(os.path.dirname(__file__), 'scene-warp.json')
    res = json.load(open(mp)) if os.path.exists(mp) else {}
    for n in (sys.argv[1:] or names):
        q, nr, o, conf = snap(n)
        d = nr * o[:, None]
        res[n] = [[round(float(a), 1), round(float(b), 1), round(float(c), 1), round(float(e), 1)] for (a, b), (c, e) in zip(q, d)]
        print(n, 'mean |offset| %.1f m, max %.1f m, conf %.2f' % (np.abs(o).mean(), np.abs(o).max(), conf), flush=True)
    json.dump(res, open(mp, 'w'), separators=(',', ':'))
