import numpy as np, cv2
import scene_lib
from scene_lib import CLS, CELL
def SL_CELL(): return scene_lib.CELL

def normalise(rgb, valid):
    """Hazy or dull pictures (Suzuka, Zandvoort) get their colour and contrast stretched so one classifier fits all of them."""
    bgr = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    if not valid.any(): return rgb
    s = hsv[..., 1][valid] / 255; v = hsv[..., 2][valid] / 255
    sp = np.percentile(s, 92); vlo, vhi = np.percentile(v, 3), np.percentile(v, 97)
    gain = float(np.clip(0.42 / max(sp, 0.05), 1.0, 3.2))
    hsv[..., 1] = np.clip(hsv[..., 1] * gain, 0, 255)
    vv = hsv[..., 2] / 255
    vv = np.clip((vv - vlo) / max(vhi - vlo, 0.2), 0, 1) * 0.92 + 0.04
    hsv[..., 2] = vv * 255
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32) / 255
    return out

def classify(rgb, tex, valid, urban=False, biome='temperate'):
    raw = rgb
    rgb = normalise(rgb, valid)
    s_raw = cv2.cvtColor((np.clip(raw, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2HSV)[..., 1].astype(np.float32) / 255
    """rgb float HxWx3 (BGR order from cv2), tex local contrast. Returns uint8 class grid and a luminance index."""
    bgr = (rgb * 255).astype(np.uint8)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    h = hsv[..., 0]; s = hsv[..., 1] / 255; v = hsv[..., 2] / 255
    b, g, r = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    exg = 2 * g - r - b
    cls = np.zeros(h.shape, np.uint8)
    blue = (h >= 82) & (h <= 135)
    # real water is saturated; blue-grey shadow in a street canyon is not (that is filtered below by size too)
    water = (blue & (s > 0.26) & (v < 0.9) & ((v >= 0.28) | (tex < 0.022))) | (blue & (s > 0.08) & (v > 0.55) & (tex < 0.05))
    water &= (s_raw > 0.15)
    if not urban: water &= (tex < 0.03)
    veg = (h >= 26) & (h < 82) & (s > 0.14) & (exg > 0.015) & ~water
    tree = veg & ((v < 0.30) | (tex > 0.075) & (v < 0.42))
    grass = veg & ~tree
    dry = (h >= 8) & (h < 34) & (s > 0.14) & (v > 0.30) & ~veg & ~water & (tex < 0.075)
    warm_urban = (h >= 5) & (h < 34) & (s > 0.10) & (v > 0.25) & (tex >= 0.075) & ~veg & ~water
    roof_red = ((h < 12) | (h > 170)) & (s > 0.32) & (v > 0.30)
    pale = (s < 0.12) & (v > 0.66)
    greyish = (s < 0.16) & ~pale
    roads = greyish & (tex < 0.045) & (v > 0.18) & (v < 0.66)
    building = roof_red | warm_urban | (greyish & ~roads) | (pale & (tex > 0.05)) | (blue & ~water & (tex > 0.05))
    if not urban:
        # open country: dark textured ground is woodland, grey scrub and sand is not a building
        # woodland needs real evidence of leaves in the ORIGINAL picture: a green or olive hue. Dark shadow, tarmac edges and
        # stained sand are dark and textured too, and read as forest in the stretched copy (Bahrain looked like a park).
        rh = cv2.cvtColor((np.clip(raw, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2HSV)[..., 0].astype(np.float32)
        leafy = (rh >= 30) & (rh < 100) & (s_raw > 0.22) if biome == 'desert' else (((rh >= 30) & (rh < 100) & (s_raw > 0.12)) if biome == 'dry' else np.ones_like(veg))
        woods = (v < 0.40) & (tex > 0.03) & ~water & ~roof_red & ~(pale) & (s < 0.55) & leafy
        tree = (tree & leafy) | woods | (veg & (v < 0.5) & leafy)
        grass = grass & ~tree
        building = roof_red | (pale & (tex > 0.06) & (v > 0.7)) | (greyish & ~roads & (v > 0.5) & (tex > 0.06) & ~tree)
        building &= ~tree
    cls[:] = CLS['dry']
    cls[roads] = CLS['paved']; cls[pale & ~building] = CLS['light']
    cls[building] = CLS['building']; cls[dry] = CLS['dry']
    cls[grass] = CLS['grass']; cls[tree] = CLS['tree']; cls[water] = CLS['water']
    cls[~valid] = 0
    # water has to be a body of water: small blue blobs are shadows or pools, give them back to the land around them
    wm = (cls == CLS['water']).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(wm, connectivity=4)
    for i in range(1, n):
        x, y, w_, h_, area = stats[i]
        if area * (SL_CELL() ** 2) < (3600 if urban else 9000) and not (x == 0 or y == 0 or x + w_ >= wm.shape[1] or y + h_ >= wm.shape[0]):
            cls[lab == i] = CLS['building'] if tex[lab == i].mean() > 0.05 else CLS['paved']
    return cls

def clean(cls, valid, passes=2):
    out = cls.copy()
    for _ in range(passes):
        # 3x3 majority vote
        k = 9
        votes = np.zeros((k + 1,) + out.shape, np.uint8)
        stack = []
        for c in range(9):
            m = (out == c).astype(np.float32)
            stack.append(cv2.blur(m, (3, 3)))
        st = np.stack(stack)
        out = np.argmax(st, axis=0).astype(np.uint8)
    out[~valid] = 0
    return out

PALETTE = {0:(40,40,40), 1:(200,120,40), 2:(40,110,40), 3:(80,200,100), 4:(120,190,220), 5:(60,60,200), 6:(110,110,110), 7:(220,220,220), 8:(60,160,160)}
def preview(cls):
    out = np.zeros(cls.shape + (3,), np.uint8)
    for c, col in PALETTE.items(): out[cls == c] = col
    return out
