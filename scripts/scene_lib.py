"""Shared helpers for turning the user's satellite images into low-resolution land-cover grids.
Runs offline with numpy + opencv. The game never ships the photos, only the derived class grids."""
import json, math, numpy as np, cv2
CELL = 4.0          # metres per grid cell
PAD = 480.0         # metres of scenery kept around the track bounds

CLS = dict(none=0, water=1, tree=2, grass=3, dry=4, building=5, paved=6, light=7, scrub=8)

def load_geo(path):
    return json.load(open(path))

def world_grid(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0 = math.floor((min(xs) - PAD) / CELL) * CELL; y0 = math.floor((min(ys) - PAD) / CELL) * CELL
    x1 = math.ceil((max(xs) + PAD) / CELL) * CELL; y1 = math.ceil((max(ys) + PAD) / CELL) * CELL
    return x0, y0, int((x1 - x0) / CELL), int((y1 - y0) / CELL)

def sample_layer(img_path, par, pts, grid, texture=False):
    """Resample one satellite image onto the world grid. Returns (rgb float32 HxWx3, tex HxW, valid HxW)."""
    x0, y0, W, H = grid
    im = cv2.imread(img_path).astype(np.float32) / 255.0
    s = par['s']; cx = par['cx']; cy = par['cy']
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    bx = (min(xs) + max(xs)) / 2; by = (min(ys) + max(ys)) / 2
    g = cv2.cvtColor((im * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    mu = cv2.blur(g, (3, 3)); sd = np.sqrt(np.maximum(cv2.blur(g * g, (3, 3)) - mu * mu, 0))
    f = s / CELL  # image px -> cell scale
    if f < 1:
        k = max(1, int(round(1 / f)))
        im_s = cv2.resize(im, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        sd_s = cv2.resize(sd, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        sc = f
    else:
        im_s, sd_s, sc = im, sd, 1.0
    # world cell centre (X,Y) -> image px = (X-bx)/s + cx -> scaled by sc
    gx, gy = np.meshgrid(x0 + (np.arange(W) + .5) * CELL, y0 + (np.arange(H) + .5) * CELL)
    u = ((gx - bx) / s + cx) * sc; v = ((gy - by) / s + cy) * sc
    rgb = cv2.remap(im_s, u.astype(np.float32), v.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(-1, -1, -1))
    tex = cv2.remap(sd_s, u.astype(np.float32), v.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    # valid where inside the image with a 12px margin (edge has the Google logo strip at the bottom)
    inx = (u >= 12 * sc) & (u < (im.shape[1] - 12) * sc) & (v >= 12 * sc) & (v < (im.shape[0] - 40) * sc)
    return rgb, tex, inx

def mosaic(name, geo, P, root):
    """The wide picture alone gives one consistent source for the whole neighbourhood."""
    pts = geo[name]['pts']; grid = world_grid(pts)
    i = geo['_index'][name]
    par = P[name]
    if par['w'] != 'b':
        import os
        reg = json.load(open(os.path.join(os.path.dirname(__file__), 'scene-reg.json'))).get(name) or {}
        k = 0.25 if reg.get('k', 0.5) < 0.375 else 0.5
        par = dict(w='b', s=par['s'] / k, cx=640 + (par['cx'] - 640) * k, cy=640 + (par['cy'] - 640) * k)
    rb, tb, vb = sample_layer(f"{root}/b/p-{i:03d}.jpg", par, pts, grid)
    return grid, np.clip(rb, 0, 1), tb, vb
