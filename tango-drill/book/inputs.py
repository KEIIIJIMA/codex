# 組み立てスクリプト共通の読み込み。入力の不備（ファイルが無い、列の数が違う、JSON が読み取れない）は
# 黙って飛ばさず、ファイル名と行番号を出して終了コード1で止める。
import json, os, sys

def _name(path):
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    p = os.path.abspath(path)
    return os.path.relpath(p, here) if p.startswith(here + os.sep) else path

def fail(msg):
    sys.exit('入力の誤り: ' + msg)

def _open(path):
    try:
        return open(path, encoding='utf-8')
    except FileNotFoundError:
        fail(f'{_name(path)}: ファイルがありません')

def tsv(path, ncols):
    """タブ区切りの行を列のリストで返す。# で始まる行と空行は飛ばす。ncols は列の数（整数、または許される数のタプル）。"""
    ok = ncols if isinstance(ncols, tuple) else (ncols,)
    rows = []
    with _open(path) as f:
        for i, l in enumerate(f, 1):
            if l.startswith('#') or not l.strip():
                continue
            p = l.rstrip('\n').split('\t')
            if len(p) not in ok:
                fail(f'{_name(path)}:{i}: 列の数が {"か".join(map(str, ok))} ではありません（{len(p)} 列）: {l.strip()[:60]}')
            rows.append(p)
    return rows

def load_json(path):
    with _open(path) as f:
        try:
            return json.load(f)
        except json.JSONDecodeError as e:
            fail(f'{_name(path)}: 読み取れません: {e}')

def loads_json(text, name):
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        fail(f'{name}: 読み取れません: {e}')
