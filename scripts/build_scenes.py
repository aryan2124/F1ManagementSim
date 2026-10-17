"""Turns the satellite images into the game's scene assets. Offline, run by the developer.
usage: python3 scripts/build_scenes.py [circuit ids...]   (default: all)
Inputs : /tmp/sat/{a,b}/p-NNN.jpg and scripts/scene-params.json (alignment found by edge matching against the GPS outline)
Outputs: public/scenes/<id>.cls.png  grayscale class grid (4 m cells)
         public/scenes/<id>.tint.png palette image, the quantised local colour of each cell
         src/game/scenes.generated.ts metadata + detected boats"""
import sys, os, json, math, numpy as np, cv2
from PIL import Image
import scene_lib as SL
from scene_lib import CLS, world_grid, mosaic
from classify import classify, clean, preview, normalise

ROOT = '/tmp/sat'
names = json.load(open(f'{ROOT}/names.json')); geo = json.load(open('/tmp/scenes/geo.json'))
geo['_index'] = {n: i for i, n in enumerate(names)}
P = json.load(open(os.path.join(os.path.dirname(__file__), 'scene-params.json')))
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'scenes'); os.makedirs(OUT, exist_ok=True)
ID_FIX = {'madrid': 'madring'}

def track_mask(pts, grid):
    x0, y0, W, H = grid
    CELL = SL.CELL
    m = np.zeros((H, W), np.uint8)
    q = np.array([[(p[0] - x0) / CELL, (p[1] - y0) / CELL] for p in pts], np.float32)
    cv2.polylines(m, [np.round(q).astype(np.int32).reshape(-1, 1, 2)], True, 255, 1)
    dist = cv2.distanceTransform(255 - m, cv2.DIST_L2, 3) * CELL
    return dist

URBAN = {'interlagos', 'monaco', 'baku', 'marina-bay', 'las-vegas', 'jeddah', 'miami', 'sochi', 'jacarepagua', 'mexico', 'albert-park', 'montreal', 'buenos-aires', 'madring'}
BIOME = {'bahrain': 'desert', 'jeddah': 'desert', 'lusail': 'desert', 'yas-marina': 'desert', 'las-vegas': 'desert', 'kyalami': 'dry', 'cota': 'dry', 'istanbul': 'dry', 'portimao': 'dry', 'barcelona': 'dry', 'paul-ricard': 'dry', 'estoril': 'dry', 'hungaroring': 'dry', 'mexico': 'dry'}
# Circuits with no real lake, pond or sea in view: dark shadow, blue run-off paint and bluish forest read as water in a picture, so it is not allowed
NOWATER = {'spa', 'bahrain', 'lusail', 'nurburgring', 'silverstone', 'hockenheim', 'red-bull-ring', 'barcelona', 'hungaroring', 'mugello', 'portimao',
           'istanbul', 'estoril', 'monza', 'magny-cours', 'kyalami', 'mexico', 'watkins-glen', 'madring', 'imola', 'paul-ricard'}
# smooth dark green water (algae lakes) that reads as grass or forest
GREENWATER = {'interlagos', 'buenos-aires'}
FINE = {'interlagos': 3.0, 'monaco': 2.0, 'marina-bay': 2.0, 'baku': 2.5, 'las-vegas': 2.5, 'jeddah': 2.5, 'miami': 2.5, 'mexico': 2.5, 'albert-park': 3.0, 'montreal': 3.0, 'madring': 2.5, 'sochi': 3.0, 'jacarepagua': 3.0, 'yas-marina': 3.0}

def process(n, preview_dir=None):
    SL.CELL = FINE.get(n, 4.0)
    pts = geo[n]['pts']
    grid, rgb, tex, valid = mosaic(n, geo, P, ROOT)
    x0, y0, W, H = grid
    urban = n in URBAN
    cls = clean(classify(rgb, tex, valid, urban, BIOME.get(n, 'temperate')), valid)
    rgb_raw = rgb
    rgb = normalise(rgb, valid)
    d = track_mask(pts, grid)
    hsv0 = cv2.cvtColor((np.clip(rgb, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    if n in NOWATER:
        w = cls == CLS['water']
        cls[w] = CLS['paved'] if urban else np.where(hsv0[..., 2][w] / 255 < 0.30, CLS['tree'], CLS['dry'])
    if n in GREENWATER:
        sm = cv2.blur(((hsv0[..., 0] >= 40) & (hsv0[..., 0] < 100) & (hsv0[..., 1] / 255 > 0.25) & (hsv0[..., 2] / 255 < 0.5) & (tex < 0.02)).astype(np.float32), (5, 5)) > 0.7
        nn, lb, st, _ = cv2.connectedComponentsWithStats(sm.astype(np.uint8), connectivity=4)
        for i in range(1, nn):
            if st[i, 4] * (SL.CELL ** 2) > 5000: cls[(lb == i)] = CLS['water']
    if n == 'zandvoort':
        # the North Sea reads orange in this picture (low sun on wet sand): saturated orange is water
        sea = (hsv0[..., 0] < 22) & (hsv0[..., 1] / 255 > 0.5) & valid
        sea = cv2.morphologyEx(sea.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
        cls[sea] = CLS['water']
        # the dunes: sand with scrub, not a town. Isolated specks of 'building' are shrub and bare patches
        bm = (cls == CLS['building']).astype(np.uint8)
        keep = cv2.morphologyEx(bm, cv2.MORPH_OPEN, np.ones((4, 4), np.uint8)) > 0
        cls[(cls == CLS['building']) & ~keep] = CLS['dry']

    ob = {}
    try: ob = json.load(open(os.path.join(os.path.dirname(__file__), 'scene-objects.json'))).get(n, {})
    except Exception: pass
    if len(ob.get('boats', [])) >= 12:
        # moored boats are drawn as animated sprites, so the water under them must be water, not a pale blob of 'rooftop'
        wl = (cls == CLS['water']).astype(np.uint8)
        k = int(max(5, 34 / SL.CELL)) | 1
        closed = cv2.morphologyEx(wl, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        cnt, lab, st, _ = cv2.connectedComponentsWithStats(closed, connectivity=4)
        big = np.zeros_like(closed)
        for i in range(1, cnt):
            if st[i, 4] * SL.CELL * SL.CELL > 12000: big[lab == i] = 1
        big = cv2.dilate(big, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        bg = (np.clip(rgb, 0, 1) * 255).astype(np.uint8); hv = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV).astype(np.float32)
        pale = (hv[..., 2] / 255 > 0.58) & (hv[..., 1] / 255 < 0.28)
        flood = (big > 0) & pale & (cls != CLS['water']) & (cls != CLS['paved'])
        # keep quays: only convert pale cells that are within 14 m of real water
        near_w = cv2.dilate(wl, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(28 / SL.CELL) | 1, int(28 / SL.CELL) | 1))) > 0
        cls[flood & near_w] = CLS['water']
    near = d < 20
    cls[(d < 10)] = CLS['paved']
    if n not in URBAN:
        # a photographed road running alongside the drawn track would read as a ghost lane, so give it back to the runoff
        cls[(d >= 10) & (d < 19) & (cls == CLS['paved'])] = CLS['dry']
    for bad in (CLS['building'], CLS['tree'], CLS['water'], CLS['light']):
        cls[near & (cls == bad) & (d >= 10)] = np.where(bad == CLS['light'], CLS['paved'], CLS['grass'])[()] if False else (CLS['paved'] if bad in (CLS['building'], CLS['water'], CLS['light']) else CLS['grass'])
    # tint: local colour. Whole roofs, fields and lots take one flat colour (their median) so the art reads as shapes, not photo noise.
    bgr = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    bgr = cv2.medianBlur(bgr, 3)
    # take the sun out of the picture: hill shading and long building shadows would otherwise be drawn as dirt
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    Lc = lab[..., 0]
    bg = cv2.GaussianBlur(Lc, (0, 0), 14 / SL.CELL * 2.0)
    gain = np.clip(np.mean(Lc[valid]) / np.maximum(bg, 1), 0.9, 1.7) if valid.any() else 1
    lab[..., 0] = np.clip(Lc * (1 + (gain - 1) * 0.65), 0, 255)
    # dark pixels in a mostly bright neighbourhood are shadow: lift them toward the neighbourhood
    sh = np.clip((bg - Lc) / 90.0, 0, 0.7)
    lab[..., 0] = lab[..., 0] + (bg - lab[..., 0]) * sh * (cls != CLS['water']) * (cls != CLS['tree'])
    bgr = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    bgr = cv2.pyrMeanShiftFiltering(bgr, 6, 20)
    bgr = cv2.medianBlur(bgr, 3)
    rgb8 = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    # where the pictures do not reach, continue the land by mirroring it across the edge (water simply carries on)
    hole = ~valid
    if hole.any() and valid.any():
        dist, lbl = cv2.distanceTransformWithLabels(hole.astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
        ys, xs = np.where(~hole)
        # label -> coordinates of the valid pixel that owns it
        lab_of = lbl[ys, xs]
        sy = np.zeros(lbl.max() + 1, np.int32); sx = np.zeros(lbl.max() + 1, np.int32)
        sy[lab_of] = ys; sx[lab_of] = xs
        hy, hx = np.where(hole)
        ny, nx = sy[lbl[hy, hx]], sx[lbl[hy, hx]]
        my = np.clip(2 * ny - hy, 0, cls.shape[0] - 1); mx = np.clip(2 * nx - hx, 0, cls.shape[1] - 1)
        ok = valid[my, mx]
        wat = cls[ny, nx] == CLS['water']
        use_y = np.where(ok & ~wat, my, ny); use_x = np.where(ok & ~wat, mx, nx)
        cls[hy, hx] = cls[use_y, use_x]
        rgb8[hy, hx] = rgb8[use_y, use_x]
        valid = np.ones_like(valid)
    im = Image.fromarray(rgb8).quantize(colors=28, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    im.save(f'{OUT}/{n}.tint.png', optimize=True)
    Image.fromarray(cls).save(f'{OUT}/{n}.cls.png', optimize=True)
    if preview_dir:
        pv = preview(cls); both = np.hstack([bgr, pv]); k = 1000 / both.shape[1]
        cv2.imwrite(f'{preview_dir}/{n}.jpg', cv2.resize(both, None, fx=k, fy=k, interpolation=cv2.INTER_AREA))
    # dominant street direction (modulo 90 degrees) from the gradients of the built-up cells
    g = cv2.cvtColor((np.clip(rgb, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    g = cv2.GaussianBlur(g, (0, 0), 1.0)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
    m = (cv2.blur((cls == CLS['building']).astype(np.float32), (9, 9)) > 0.35) & (d > 14) & valid
    if m.sum() > 400:
        mag = np.hypot(gx, gy)[m]; th = np.arctan2(gy, gx)[m]
        c4 = np.sum(mag * np.cos(4 * th)); s4 = np.sum(mag * np.sin(4 * th))
        ang = math.atan2(s4, c4) / 4   # direction of the gradient; streets run perpendicular, same modulo 90
    else: ang = 0.0
    return dict(x0=x0, y0=y0, w=W, h=H, cell=SL.CELL, ang=round(ang, 3))

if __name__ == '__main__':
    todo = [ID_FIX.get(a, a) for a in sys.argv[1:]] or names
    meta = {}
    mp = os.path.join(os.path.dirname(__file__), 'scene-meta.json')
    if os.path.exists(mp): meta = json.load(open(mp))
    for n in todo:
        meta[n] = process(n, '/tmp/scenes'); print(n, meta[n], flush=True)
    json.dump(meta, open(mp, 'w'))
