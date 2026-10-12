"""食費ダッシュボードの外部公開ページを組み立てる。
使い方: FOOD_PASS=<合言葉> python3 _build/build.py <food dir> <out dir>
<food dir> には receipt_items.csv, point_days.csv, weekly_events.csv, flyer_items.csv と、
ダッシュボードのページ本体 index.html（files/index.html の text）を置く。フォントとd3はこの _build から取る。
<out dir> はこのリポジトリのルート（.）。
合言葉はファイルに書かない。データは合言葉から作った鍵で暗号化して data.enc.json に入れる。
"""
import base64, csv, json, os, re, shutil, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITER = 600000
food, out = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
pw = os.environ['FOOD_PASS']
os.makedirs(os.path.join(out, 'fonts'), exist_ok=True)

# 1. データ（4つのCSV）を暗号化
data = {}
for name in ['receipt_items', 'point_days', 'weekly_events', 'flyer_items']:
    with open(os.path.join(food, name + '.csv'), encoding='utf-8-sig', newline='') as f:
        data[name] = list(csv.DictReader(f))
plain = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
salt, iv = os.urandom(16), os.urandom(12)
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode('utf-8'))
ct = AESGCM(key).encrypt(iv, plain, None)
b64 = lambda b: base64.b64encode(b).decode('ascii')
with open(os.path.join(out, 'data.enc.json'), 'w') as f:
    json.dump({'v': 1, 'iter': ITER, 'salt': b64(salt), 'iv': b64(iv), 'ct': b64(ct)}, f)

# 2. ページ本体（Claude側のダッシュボードと同じもの）を分解
src = open(os.path.join(food, 'index.html'), encoding='utf-8').read()
m = re.match(r'\s*<style>(.*?)</style>(.*)<script>(.*)</script>\s*$', src, re.S)
assert m, 'index.html の形が想定と違う'
css, body, js = m.group(1), m.group(2), m.group(3)
n_before = css.count('@font-face')
css = re.sub(r'@font-face \{ font-family: "FD BIZ";[^}]*\}\n?', '', css)
css = re.sub(r'(font-family: "FD Num";[^}]*?font-weight: (\d00);[^}]*?)url\("[^"]*"\)', r'\1url("fonts/rajdhani-latin-\2-normal.woff2")', css)
assert css.count('@font-face') == n_before - 1 and '/_blob/' not in css, 'フォント指定の置き換えに失敗'
assert '/_blob/' not in body and '/_blob/' not in js

shell = open(os.path.join(here, 'shell.html'), encoding='utf-8').read()
for k, v in (('/*__APP_CSS__*/', css), ('<!--__APP_BODY__-->', body)):
    assert shell.count(k) == 1
    shell = shell.replace(k, v)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(shell)
open(os.path.join(out, 'app.js'), 'w', encoding='utf-8').write(js)

# 3. 付属ファイル
shutil.copy(os.path.join(here, 'd3.min.js'), out)
for w in ('500', '600'):
    shutil.copy(os.path.join(here, f'rajdhani-latin-{w}-normal.woff2'), os.path.join(out, 'fonts'))
open(os.path.join(out, '.nojekyll'), 'w').close()
open(os.path.join(out, 'robots.txt'), 'w').write('User-agent: *\nDisallow: /\n')
print('rows', {k: len(v) for k, v in data.items()}, 'bytes', len(ct))
