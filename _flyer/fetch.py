# トクバイのスーパーマルハチ田川店ページから、掲載中のチラシ画像を取得して out/ に保存する
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

STORE = "https://tokubai.co.jp/" + urllib.parse.quote("スーパーマルハチ") + "/227685"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OUT = sys.argv[1] if len(sys.argv) > 1 else "out"
os.makedirs(OUT, exist_ok=True)

def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")

def text(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()

log = {"fetched_at": datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds"), "leaflets": [], "errors": []}
try:
    store = get(STORE)
except Exception as e:
    log["errors"].append(f"store: {e!r}")
    store = ""
open(os.path.join(OUT, "store.html"), "w").write(store)

ids = []
for m in re.finditer(r'href="([^"]*/leaflets/(\d+))[^"]*"', store):
    if m.group(2) not in ids:
        ids.append(m.group(2))

for lid in ids:
    entry = {"leaflet_id": lid, "images": []}
    try:
        page = get(f"{STORE}/leaflets/{lid}")
        t = re.search(r"<title>(.*?)</title>", page, re.S)
        entry["title"] = text(t.group(1)) if t else ""
        d = re.search(r'<meta[^>]+name="description"[^>]+content="([^"]*)"', page)
        entry["description"] = d.group(1) if d else ""
        paths = []
        for p in re.findall(r'image\.tokubai\.co\.jp(/images/bargain_office_leaflets/[^"\'\s?]+\.(?:jpg|jpeg|png))', page):
            if "o=true" in p and p not in paths:
                paths.append(p)
        if not paths:
            for p in re.findall(r'image\.tokubai\.co\.jp(/images/bargain_office_leaflets/[^"\'\s?]+\.(?:jpg|jpeg|png))', page):
                if p not in paths:
                    paths.append(p)
        for i, p in enumerate(paths, 1):
            name = f"{lid}_{i}.jpg"
            img = get("https://image.tokubai.co.jp" + p, binary=True)
            open(os.path.join(OUT, name), "wb").write(img)
            entry["images"].append({"file": name, "path": p, "bytes": len(img)})
            time.sleep(1)
    except Exception as e:
        log["errors"].append(f"{lid}: {e!r}")
    log["leaflets"].append(entry)
    time.sleep(1)

json.dump(log, open(os.path.join(OUT, "leaflets.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in log.items()}, ensure_ascii=False))
