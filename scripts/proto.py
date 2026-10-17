import sys, json, numpy as np, cv2
from scene_lib import *
from classify import *
names = json.load(open('/tmp/sat/names.json')); geo = json.load(open('/tmp/scenes/geo.json')); geo['_index'] = {n: i for i, n in enumerate(names)}
P = json.load(open('scene-params.json'))
for n in sys.argv[1:]:
    grid, rgb, tex, valid = mosaic(n, geo, P, '/tmp/sat')
    cls = clean(classify(rgb, tex, valid), valid)
    sat = (rgb * 255).astype(np.uint8)
    pv = preview(cls)
    both = np.hstack([sat, pv]); sc = 1000 / both.shape[1]
    cv2.imwrite(f'/tmp/scenes/proto_{n}.jpg', cv2.resize(both, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA))
    print(n, grid, [(k, round(float((cls == v).mean()), 3)) for k, v in CLS.items()])
