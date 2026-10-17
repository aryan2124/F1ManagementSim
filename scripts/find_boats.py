"""Finds moored boats and yachts in the close satellite pictures: bright shapes sitting inside a body of water.
Writes scripts/scene-objects.json  {circuit: {boats: [[x_m, y_m, length_m, width_m, angle_rad], ...]}}"""
import sys, os, json, math, numpy as np, cv2
import scene_lib as SL
from classify import classify, clean
from scene_lib import world_grid, sample_layer
names = json.load(open('/tmp/sat/names.json')); geo = json.load(open('/tmp/scenes/geo.json'))
P = json.load(open(os.path.join(os.path.dirname(__file__), 'scene-params.json')))
REG = json.load(open(os.path.join(os.path.dirname(__file__), 'scene-reg.json')))
def kof(n):
    k = (REG.get(n) or {}).get('k', 0.5)
    return 0.25 if k < 0.375 else 0.5   # close image is 2x or 4x the wide one
def conv(par_, w, n=None):
    if w == par_['w']: return par_
    k = kof(n) if n else 0.5
    if w == 'a':   # derive close params from wide params
        return dict(w='a', s=par_['s'] * k, cx=640 + (par_['cx'] - 640) / k, cy=640 + (par_['cy'] - 640) / k)
    return dict(w='b', s=par_['s'] / k, cx=640 + (par_['cx'] - 640) * k, cy=640 + (par_['cy'] - 640) * k)

def boats_for(n, near=900):
    SL.CELL = 1.0
    pts = np.array(geo[n]['pts'], np.float32); i = names.index(n)
    grid = world_grid(geo[n]['pts']); x0, y0, W, H = grid
    rgb, tex, valid = sample_layer(f'/tmp/sat/a/p-{i:03d}.jpg', conv(P[n], 'a', n), geo[n]['pts'], grid)
    bgr = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
    cl = clean(classify(rgb, tex, valid, True), valid, 1)
    waterlike = ((cl == SL.CLS['water']) & (v > 0.2)).astype(np.uint8)
    closed = cv2.morphologyEx(waterlike, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    cnt, lab, st, _ = cv2.connectedComponentsWithStats(closed, connectivity=4)
    big = np.zeros_like(closed)
    for k in range(1, cnt):
        m = lab == k
        if st[k, 4] > 6000 and float(tex[m].mean()) < 0.09: big[m] = 1
    big = cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    # hulls are white; piers, quays and decks are tan or grey, so a hard whiteness test separates most of them
    g = cv2.GaussianBlur(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255, (0, 0), 0.8)
    white = (v > 0.66) & (s < 0.2) & (g > 0.62)
    cand = ((big > 0) & white & valid).astype(np.uint8)
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    cnt, lab, st, cen = cv2.connectedComponentsWithStats(cand, connectivity=8)
    out = []
    for k in range(1, cnt):
        area = st[k, 4]
        if area < 8 or area > 900: continue
        ys, xs = np.where(lab == k)
        pts_ = np.stack([xs, ys], 1).astype(np.float32)
        (cx_, cy_), (rw, rh), ang = cv2.minAreaRect(pts_)
        L, Wd = max(rw, rh), min(rw, rh)
        if L < 4 or Wd < 1.4 or L > 70 or (L / max(Wd, 0.1) > 9): continue
        if rw < rh: ang = ang + 90
        wx = x0 + (cx_ + 0.5) * SL.CELL; wy = y0 + (cy_ + 0.5) * SL.CELL
        d = np.min(np.hypot(pts[:, 0] - wx, pts[:, 1] - wy))
        if d > near: continue
        out.append((d, [round(wx), round(wy), round(L, 1), round(Wd, 1), round(math.radians(ang), 2)]))
    out.sort(key=lambda t: t[0])
    return [b for _, b in out[:420]]

if __name__ == '__main__':
    mp = os.path.join(os.path.dirname(__file__), 'scene-objects.json')
    res = json.load(open(mp)) if os.path.exists(mp) else {}
    for n in (sys.argv[1:] or names):
        b = boats_for(n); res[n] = {'boats': b}; print(n, len(b), flush=True)
    json.dump(res, open(mp, 'w'), separators=(',', ':'))
