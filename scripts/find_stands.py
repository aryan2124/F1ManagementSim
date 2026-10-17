"""Finds grandstand-like structures beside the track in the satellite pictures: big, long, roofed shapes
whose long side runs roughly parallel to the track, 12 to 90 m from the edge of the road.
Adds {stands: [[x, y, length_m, depth_m, angle_rad, side]]} to scripts/scene-objects.json"""
import sys, os, json, math, numpy as np, cv2
import scene_lib as SL
from scene_lib import world_grid, sample_layer
from classify import classify, clean
from find_boats import names, geo, P, conv
def stands_for(n):
    SL.CELL = 1.0
    pts = np.array(geo[n]['pts'], np.float32); i = names.index(n)
    grid = world_grid(geo[n]['pts']); x0, y0, W, H = grid
    rgb, tex, valid = sample_layer(f'/tmp/sat/a/p-{i:03d}.jpg', conv(P[n], 'a', n), geo[n]['pts'], grid)
    bgr = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32); s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
    m = np.zeros((H, W), np.uint8)
    q = np.array([[p[0] - x0, p[1] - y0] for p in pts], np.float32)
    cv2.polylines(m, [np.round(q).astype(np.int32).reshape(-1, 1, 2)], True, 255, 1)
    dist = cv2.distanceTransform(255 - m, cv2.DIST_L2, 3)
    # structure = bright or strongly coloured, low texture, not vegetation, not asphalt
    h = hsv[..., 0]
    veg = (h >= 26) & (h < 90) & (s > 0.2)
    water = (h >= 90) & (h <= 130) & (s > 0.3)
    roof = ((v > 0.58) & (s < 0.28)) | (((h < 14) | (h > 165)) & (s > 0.3) & (v > 0.35)) | ((h > 100) & (h < 135) & (s > 0.18) & (v > 0.5) & (v < 0.9))
    cand = (roof & ~veg & ~water & valid & (dist > 11) & (dist < 95)).astype(np.uint8)
    cand = cv2.morphologyEx(cand, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cand = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cnt, lab, st, cen = cv2.connectedComponentsWithStats(cand, connectivity=8)
    # heading of nearest track point
    tang = np.roll(pts, -1, 0) - np.roll(pts, 1, 0)
    out = []
    for k in range(1, cnt):
        area = st[k, 4]
        if area < 260 or area > 14000: continue
        ys, xs = np.where(lab == k)
        (cx_, cy_), (rw, rh), ang = cv2.minAreaRect(np.stack([xs, ys], 1).astype(np.float32))
        L, D = max(rw, rh), min(rw, rh)
        if L < 22 or D < 7 or L / D < 1.8 or L > 260: continue
        if area / (L * D) < 0.6: continue  # not a clean rectangle
        if rw < rh: ang += 90
        wx, wy = x0 + cx_ + 0.5, y0 + cy_ + 0.5
        d2 = (pts[:, 0] - wx) ** 2 + (pts[:, 1] - wy) ** 2; j = int(np.argmin(d2)); dd = math.sqrt(d2[j])
        th = math.atan2(tang[j][1], tang[j][0]); a = math.radians(ang)
        par = abs(math.sin(a - th))  # 0 when parallel
        if par > 0.45: continue
        side = 1 if ((wx - pts[j][0]) * -math.sin(th) + (wy - pts[j][1]) * math.cos(th)) > 0 else -1
        out.append([round(wx), round(wy), round(L), round(D), round(a, 2), side, round(dd)])
    out.sort(key=lambda t: -t[2] * t[3])
    return out[:60]
if __name__ == '__main__':
    mp = os.path.join(os.path.dirname(__file__), 'scene-objects.json')
    res = json.load(open(mp)) if os.path.exists(mp) else {}
    for n in (sys.argv[1:] or names):
        st = stands_for(n); res.setdefault(n, {})['stands'] = st; print(n, len(st), flush=True)
    json.dump(res, open(mp, 'w'), separators=(',', ':'))
