#!/bin/bash
# usage: run_objs.sh  (runs boat and stand detection per circuit in parallel, merges results)
cd "$(dirname "$0")"
mkdir -p /tmp/objs
python3 - <<'P' > /tmp/objs/list.txt
import json; print("\n".join(json.load(open('/tmp/sat/names.json'))))
P
cat /tmp/objs/list.txt | xargs -P 2 -I{} bash -c 'python3 - {} <<PY
import sys, json
import find_boats as FB, find_stands as FS
n=sys.argv[1]
b = FB.boats_for(n) if n in ("monaco","marina-bay","yas-marina","albert-park","miami","baku","jeddah","sochi","montreal","jacarepagua","portimao","madring","lusail","las-vegas","sepang","bahrain") else []
s = FS.stands_for(n)
json.dump({"boats": b, "stands": s}, open(f"/tmp/objs/{n}.json","w"), separators=(",",":"))
print(n, len(b), len(s), flush=True)
PY' > /tmp/objs/log.txt 2>&1
echo done >> /tmp/objs/log.txt
