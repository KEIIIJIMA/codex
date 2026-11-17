# 古文常識の挿絵（src/joshiki_img.js）を、本の写真から作り直す。
# 使い方: python3 book/illust/make_img.py <写真のフォルダ> [--png <確認用のフォルダ>]
#   写真のフォルダには crops.tsv の1列目の ID ごとに「<ID>-image.jpg」を置く（写真はリポジトリに入れない。一覧は README.md）。
#   各写真を crops.tsv の座標で切り抜き、時計回りに90度回し（写真は横向きに撮ってある）、長い辺が760pxを超えるものは縮め、
#   JPEG（品質72、optimize）にして data URI で src/joshiki_img.js に書き出す。--png を付けると、切り抜いた画像も PNG で保存する。
# 必要: Python 3.11 以上、Pillow（pip install Pillow）
import base64, io, json, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)) + '/'
sys.path.insert(0, os.path.dirname(HERE[:-1]))
from inputs import tsv, fail

BASE_W, MAX_SIDE, QUALITY = 2000, 760, 72
args = sys.argv[1:]
if not args or args[0].startswith('-'): sys.exit('使い方: python3 book/illust/make_img.py <写真のフォルダ> [--png <確認用のフォルダ>]')
photos, png = args[0], (args[args.index('--png') + 1] if '--png' in args else None)
if png: os.makedirs(png, exist_ok=True)
out = {}
for pid, key, *box in tsv(HERE + 'crops.tsv', 6):
    f = os.path.join(photos, pid + '-image.jpg')
    if not os.path.exists(f): fail(f'{f}: 写真がありません')
    if key in out: fail(f'book/illust/crops.tsv: キー {key} が重複しています')
    im = Image.open(f); s = im.size[0] / BASE_W
    c = im.crop(tuple(int(int(v) * s) for v in box)).transpose(Image.ROTATE_270)
    if png: c.save(os.path.join(png, key + '.png'))
    c = c.convert('RGB'); c.thumbnail((MAX_SIDE, MAX_SIDE))
    b = io.BytesIO(); c.save(b, 'JPEG', quality=QUALITY, optimize=True)
    out[key] = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
dst = os.path.join(os.path.dirname(os.path.dirname(HERE[:-1])), 'src', 'joshiki_img.js')
open(dst, 'w', encoding='utf-8').write('const JOSHIKI_IMG=' + json.dumps(out) + ';\n')
print('images', len(out), '→ src/joshiki_img.js', os.path.getsize(dst), 'bytes')
