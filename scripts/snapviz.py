import sys, json, cv2, numpy as np
import snap as S
n=sys.argv[1]; w=sys.argv[2] if len(sys.argv)>2 else 'a'
W=json.load(open('scene-warp.json'))[n]; i=S.names.index(n)
pts=np.array(S.geo[n]['pts']); b0=(pts.min(0)+pts.max(0))/2; pr=S.conv(S.P[n],w)
im=cv2.imread(f'/tmp/sat/{w}/p-{i:03d}.jpg')
g=np.array(W); q=g[:,:2]; d=g[:,2:]
to=lambda p:((p-b0)/pr['s']+[pr['cx'],pr['cy']]).astype(np.int32).reshape(-1,1,2)
cv2.polylines(im,[to(q)],True,(255,255,0),2); cv2.polylines(im,[to(q+d)],True,(0,0,255),2)
cv2.imwrite(f'/tmp/scenes/snap_{n}.jpg',cv2.resize(im,(1000,1000)))
