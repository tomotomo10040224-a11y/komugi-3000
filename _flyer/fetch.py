# トクバイのスーパーマルハチ田川店ページから、掲載中のチラシ画像を取得して OUT に保存する。
# OUT には前回までの画像と leaflets.json が入っている前提で、新しいチラシを足し、14日より古いものを消す。
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

STORE = "https://tokubai.co.jp/" + urllib.parse.quote("スーパーマルハチ") + "/227685"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
OUT = sys.argv[1]
JST = timezone(timedelta(hours=9))
now = datetime.now(JST)
os.makedirs(OUT, exist_ok=True)
man_path = os.path.join(OUT, "leaflets.json")
try:
    man = json.load(open(man_path))
except Exception:
    man = {}
leaflets = man.get("leaflets", {}) if isinstance(man.get("leaflets"), dict) else {}

def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")

errors = []
try:
    store = get(STORE)
except Exception as e:
    errors.append(f"store: {e!r}")
    store = ""

current = []
for m in re.finditer(r'<a[^>]+href="[^"]*/leaflets/(\d+)[^"]*"[^>]*>(.*?)</a>', store, re.S):
    lid, inner = m.group(1), m.group(2)
    img = re.search(r'(/images/bargain_office_leaflets/[^"\'\s?]*?/(\d+)\.(?:jpg|jpeg|png))', inner)
    if not img:
        continue
    label = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", inner)).replace("クリックして チラシを見る", "").strip()
    path = re.sub(r"/images/bargain_office_leaflets/[^/]*/", "/images/bargain_office_leaflets/o=true/", img.group(1))
    current.append(lid)
    if lid in leaflets and os.path.exists(os.path.join(OUT, leaflets[lid]["file"])):
        leaflets[lid]["label"] = label
        leaflets[lid]["last_seen"] = now.isoformat(timespec="seconds")
        continue
    try:
        data = get("https://image.tokubai.co.jp" + path, binary=True)
        name = f"{lid}.jpg"
        open(os.path.join(OUT, name), "wb").write(data)
        leaflets[lid] = {"file": name, "label": label, "image_path": path, "bytes": len(data),
                         "first_seen": now.isoformat(timespec="seconds"), "last_seen": now.isoformat(timespec="seconds")}
        time.sleep(1)
    except Exception as e:
        errors.append(f"{lid}: {e!r}")

# 14日以上見かけていないチラシは消す
for lid in list(leaflets):
    seen = datetime.fromisoformat(leaflets[lid]["last_seen"])
    if now - seen > timedelta(days=14):
        try:
            os.remove(os.path.join(OUT, leaflets[lid]["file"]))
        except FileNotFoundError:
            pass
        del leaflets[lid]

man = {"fetched_at": now.isoformat(timespec="seconds"), "current": current, "errors": errors, "leaflets": leaflets}
json.dump(man, open(man_path, "w"), ensure_ascii=False, indent=1)
keep = {v["file"] for v in leaflets.values()}
for f in os.listdir(OUT):
    if f.endswith(".html") or (f.endswith(".jpg") and f not in keep):
        os.remove(os.path.join(OUT, f))
print(json.dumps({"current": current, "errors": errors, "kept": len(leaflets)}, ensure_ascii=False))
if not current:
    sys.exit("no leaflets found")
