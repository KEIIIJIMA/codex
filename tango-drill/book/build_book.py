# 単語集準拠データ（古文330・読み70）を組み立てて src/book_data.js を出力する。
# 入力: mm_numbered.tsv（番号・見出し・品詞・意味・ページ。本の索引の書き起こし index_transcription.json から作成）, mm_related.tsv（関連語）, mm_yomi.tsv（読み）,
#       book_overrides.json（見直し済みの漢字・品詞・注・分野）,
#       mm_new97.json（新規作成した語）, exs_out_*.json（意味ごとの用例）, 既存の src/data_kobun.js と src/chunks/kobun_add.json
# 入力の不備（ファイルの欠け・列の数の違い・JSON の誤り・用例の数の食い違い）は、飛ばさずにエラーで止める（inputs.py）。
import json,re,subprocess,sys
import os
SP=os.path.dirname(os.path.abspath(__file__))+'/'
REPO=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
sys.path.insert(0,SP)
from inputs import tsv,load_json,loads_json,fail
# 既存データ
r=subprocess.run(['node','-e',f"const fs=require('fs');const g={{}};(new Function('g',fs.readFileSync('{REPO}src/data_kobun.js','utf8').replace('const KOBUN_RAW','g.K')))(g);console.log(JSON.stringify(g.K))"],capture_output=True,text=True)
if r.returncode: fail('src/data_kobun.js: 読み取れません: '+r.stderr.strip()[:300])
existing=loads_json(r.stdout,'src/data_kobun.js')+load_json(REPO+'src/chunks/kobun_add.json')
def norm(w): return [p for p in re.sub(r'[（(].*?[)）]','',w).replace('〜打消','').replace('〜禁止','').replace('〜じ','').replace('〜','').replace('・',' ').split() if p]
byhead={}
for r in existing:
    for p in norm(r[0]): byhead.setdefault(p,r)
new97={}
for r in load_json(SP+'mm_new97.json'): new97[r[0]]=r
rel={}
for h,w,pos,m in tsv(SP+'mm_related.tsv',4): rel.setdefault(h,[]).append([w,pos,m])
# 第1章の個別ページ（1〜6）から：意味の番号順と要点
p1={'おどろく':(['はっと気づく','目を覚ます'],'物音などで「はっとする」が基本。眠っている人なら「目を覚ます」。現代語の「驚く」とずれるので注意。入試では②がよく問われる。'),
 'ののしる':(['大騒ぎする','評判になる'],'「大きな声を出して騒ぐ」が基本で、悪口を言う意味はない。世間が騒ぐことから②「評判になる」の意も生じた。'),
 'ねんず':(['心の中で祈る','がまんする'],'「心で祈る」が基本。祈るには忍耐が必要なことから②「がまんする」の意が生じた。入試では②が問われやすい。'),
 'しのぶ(忍ぶ)':(['がまんする','人目を避ける'],'「忍ぶ」は恋心などを人に気づかれないように①がまんする②人目を避ける。本来は上二段だが、四段の「偲ぶ（思い慕う）」と混同された。'),
 'おぼゆ':(['自然に思われる','似る','思い出される','人から思われる'],'「思ふ」＋自発・受身の「ゆ」から。「自然に思われる」が基本で③④の意も生じた。名詞「おぼえ」は人から思われること＝評判・寵愛。'),
 'ながむ(眺む)':(['もの思いに沈む','ぼんやり見る'],'「長目」＝長い間ぼんやり見ていること。多くはもの思いにふけっている。「詠む（詩歌を詠む）」と区別する。')}
bare=lambda w: re.sub(r'[（(].*?[)）]','',w)
p1b={bare(k):v for k,v in p1.items()}
exs={}
for i in (1,2,3):
    for r in load_json(SP+f'exs_out_{i}.json'): exs[r['num']]=r['exs']
def splitm(t):
    if '｜' in t: return [x for x in t.split('｜') if x]  # 「・」を含む意味があるときは「｜」で区切る
    out,cur,d=[],'',0
    for c in t:
        if c in '(（': d+=1
        if c in ')）': d-=1
        if c=='・' and d==0: out.append(cur); cur=''
        else: cur+=c
    out.append(cur); return [x for x in out if x]
OVR={315:(['お仕えする','あります・おります','〜ございます'],'謙譲語（お仕えする）・丁寧語（あります／〜ございます）。'),
     316:(['お仕えする','あります・おります','〜ございます'],'謙譲語（お仕えする）・丁寧語（あります／〜ございます）。'),
     329:(['（天皇に）申し上げる','（上皇に）申し上げる'],'謙譲語。天皇・上皇に申し上げる場合だけに使う（絶対敬語）。'),
     330:(['（皇后に）申し上げる','（皇太子に）申し上げる'],'謙譲語。皇后・皇太子に申し上げる場合だけに使う（絶対敬語）。')}
OV=load_json(SP+'book_overrides.json')
ch=lambda n:1 if n<=50 else 2 if n<=150 else 3 if n<=250 else 4 if n<=300 else 5
out=[];missing=[]
for n,w,pos,mean,page,_ in tsv(SP+'mm_numbered.tsv',6):
    n=int(n)
    m=splitm(mean)
    src=new97.get(w)
    if not src:
        kj=re.search(r'[（(](.+?)[)）]',w); kj=kj.group(1) if kj else None
        cands=[r for r in existing if any(p in norm(r[0]) for p in norm(w))]
        if kj: cands=sorted(cands,key=lambda r:0 if r[1] and (kj in r[1] or r[1] in kj) else 1)
        src=cands[0] if cands else None
    if not src: missing.append(w); src=[w,'',pos,m,'','','',1,['名詞']]
    k=src[1] or (re.search(r'[（(](.+?)[)）]',w).group(1) if re.search(r'[（(](.+?)[)）]',w) else '')
    note=src[6]
    if bare(w) in p1b: m,note=p1b[bare(w)]
    hon=[re.search(r'[(（](尊敬|謙譲|丁寧|謙譲・丁寧)[)）]$',x) for x in m]
    tag=next((h.group(1) for h in hon if h),None)
    m=[re.sub(r'[(（](尊敬|謙譲|丁寧|謙譲・丁寧)[)）]$','',x) for x in m]
    if tag and tag not in (note or ''): note=(tag+'語。'+(note or '')).strip()
    if n in OVR: m,note=OVR[n]
    POSFIX={4:('忍ぶ','動バ上二・四'),57:('被く','動カ四'),309:('給ふ','動ハ四'),310:('給ふ','動ハ下二')}
    if n in POSFIX: k,src=POSFIX[n][0],src[:2]+[POSFIX[n][1]]+src[3:]
    # 本の意味を優先。既存データの品詞（活用の種類つき）を使う
    if exs.get(n) and len(exs[n])!=len(m): fail(f'book/exs_out_*.json: {n} {w} の用例の数（{len(exs[n])}）が意味の数（{len(m)}）と合いません')
    e=exs.get(n) if exs.get(n) else ([[src[4],src[5]]] if len(m)==1 and src[4] else None)
    # 見直し済みの漢字・品詞・注・分野（book_overrides.json、番号がキー）があれば、それを使う
    ov=OV.get(str(n))
    kk,pp,nn,tt=(ov['k'],ov['pos'],ov['note'],ov['tags']) if ov else (k,src[2] if src[2] else pos,note,src[8])
    exm,trm=(e[0][0],e[0][1]) if e else (src[4],src[5])
    out.append([n,w,kk,pp,m,exm,trm,nn,ch(n),tt,rel.get(w,[]),e])
yomi=[]
for a,kj,rd,mn,hist in tsv(SP+'mm_yomi.tsv',5):
    yomi.append([int(a),kj,rd,mn,hist])
meta={'name':'古文330','lv':{1:'1章',2:'2章',3:'3章',4:'4章',5:'敬語'},'lvd':{1:'1章 読解必修語50',2:'2章 入試必修語100',3:'3章 入試重要語100',4:'4章 入試攻略語50',5:'最重要敬語30'}}
open(REPO+'src/book_data.js','w',encoding='utf-8').write('const BOOK_META='+json.dumps(meta,ensure_ascii=False)+';\nconst BOOK_RAW='+json.dumps(out,ensure_ascii=False)+';\nconst YOMI_RAW='+json.dumps(yomi,ensure_ascii=False)+';\n')
print('per-meaning examples',sum(1 for r in out if r[11]),'/',len(out));print('book',len(out),'related',sum(len(r[10]) for r in out),'yomi',len(yomi),'missing',len(missing),missing[:10])
