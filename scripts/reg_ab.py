"""Registers each close picture ('a') onto its wide picture ('b'). The two were exported from the same map but
not always at an exact 2x, so find the real scale and offset with SIFT features and RANSAC."""
import sys, os, json, numpy as np, cv2
names = json.load(open('/tmp/sat/names.json'))
def reg(i):
    a = cv2.imread(f'/tmp/sat/a/p-{i:03d}.jpg'); b = cv2.imread(f'/tmp/sat/b/p-{i:03d}.jpg')
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY); gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
    # mask the Google logo strip and the attribution at the bottom
    ma = np.full(ga.shape, 255, np.uint8); ma[-60:, :] = 0; mb = ma.copy()
    sift = cv2.SIFT_create(6000)
    # b is the wide one, so upscale it 2x so the features are comparable in scale to a's
    gb2 = cv2.resize(gb, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC); mb2 = cv2.resize(mb, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    ka, da = sift.detectAndCompute(ga, ma); kb, db = sift.detectAndCompute(gb2, mb2)
    if da is None or db is None or len(ka) < 20 or len(kb) < 20: return None
    bf = cv2.BFMatcher(); m = bf.knnMatch(da, db, k=2)
    good = [x for x, y in m if x.distance < 0.78 * y.distance]
    if len(good) < 12: return dict(n=len(good), inl=0)
    src = np.float32([ka[g.queryIdx].pt for g in good]); dst = np.float32([kb[g.trainIdx].pt for g in good]) / 2.0  # dst in b pixel units
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4.0, maxIters=5000, confidence=0.999)
    if M is None: return dict(n=len(good), inl=0)
    k = float(np.hypot(M[0, 0], M[1, 0])); rot = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
    return dict(n=len(good), inl=int(inl.sum()), k=k, rot=rot, tx=float(M[0, 2]), ty=float(M[1, 2]))
if __name__ == '__main__':
    mp = os.path.join(os.path.dirname(__file__), 'scene-reg.json')
    res = json.load(open(mp)) if os.path.exists(mp) else {}
    for i, n in enumerate(names):
        if len(sys.argv) > 1 and n not in sys.argv[1:]: continue
        r = reg(i); res[n] = r; print(n, r, flush=True)
    json.dump(res, open(mp, 'w'))
