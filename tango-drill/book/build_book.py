# 単語集準拠データ（古文330・読み70）を組み立てて src/book_data.js を出力する。
# 入力: mm_numbered.tsv（番号・見出し・品詞・意味・ページ）, mm_related.tsv（関連語）, mm_yomi.tsv（読み）,
#       mm_new97.json（新規作成した語）, exs_out_*.json（意味ごとの用例）, 既存の src/data_kobun.js と src/chunks/kobun_add.json
import json,re,subprocess,sys
import os
SP=os.path.dirname(os.path.abspath(__file__))+'/'
REPO=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))+'/'
# 既存データ
js=subprocess.run(['node','-e',f"const fs=require('fs');const g={{}};(new Function('g',fs.readFileSync('{REPO}src/data_kobun.js','utf8').replace('const KOBUN_RAW','g.K')))(g);console.log(JSON.stringify(g.K))"],capture_output=True,text=True).stdout
existing=json.loads(js)+json.load(open(REPO+'src/chunks/kobun_add.json',encoding='utf-8'))
def norm(w): return [p for p in re.sub(r'[（(].*?[)）]','',w).replace('〜打消','').replace('〜禁止','').replace('〜じ','').replace('〜','').replace('・',' ').split() if p]
byhead={}
for r in existing:
    for p in norm(r[0]): byhead.setdefault(p,r)
new97={}
try:
    for r in json.load(open(SP+'mm_new97.json',encoding='utf-8')): new97[r[0]]=r
except FileNotFoundError: pass
rel={}
for l in open(SP+'mm_related.tsv',encoding='utf-8'):
    h,w,pos,m=l.rstrip('\n').split('\t'); rel.setdefault(h,[]).append([w,pos,m])
# 第1章の個別ページ（1〜6）から：意味の番号順と要点
p1={'おどろく':(['はっと気づく','目を覚ます'],'物音などで「はっとする」が基本。眠っている人なら「目を覚ます」。現代語の「驚く」とずれるので注意。入試では②がよく問われる。'),
 'ののしる':(['大騒ぎする','評判になる'],'「大きな声を出して騒ぐ」が基本で、悪口を言う意味はない。世間が騒ぐことから②「評判になる」の意も生じた。'),
 'ねんず':(['心の中で祈る','がまんする'],'「心で祈る」が基本。祈るには忍耐が必要なことから②「がまんする」の意が生じた。入試では②が問われやすい。'),
 'しのぶ(忍ぶ)':(['がまんする','人目を避ける'],'「忍ぶ」は恋心などを人に気づかれないように①がまんする②人目を避ける。本来は上二段だが、四段の「偲ぶ（思い慕う）」と混同された。'),
 'おぼゆ':(['自然に思われる','似る','思い出される','人から思われる'],'「思ふ」＋自発・受身の「ゆ」から。「自然に思われる」が基本で③④の意も生じた。名詞「おぼえ」は人から思われること＝評判・寵愛。'),
 'ながむ(眺む)':(['もの思いに沈む','ぼんやり見る'],'「長目」＝長い間ぼんやり見ていること。多くはもの思いにふけっている。「詠む（詩歌を詠む）」と区別する。')}
exs={}
for i in (1,2,3):
    try:
        for r in json.load(open(SP+f'exs_out_{i}.json',encoding='utf-8')): exs[r['num']]=r['exs']
    except FileNotFoundError: pass
def splitm(t):
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
ch=lambda n:1 if n<=50 else 2 if n<=150 else 3 if n<=250 else 4 if n<=300 else 5
out=[];missing=[]
for l in open(SP+'mm_numbered.tsv',encoding='utf-8'):
    n,w,pos,mean,page,_=l.rstrip('\n').split('\t'); n=int(n)
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
    if w in p1: m,note=p1[w]
    hon=[re.search(r'[(（](尊敬|謙譲|丁寧|謙譲・丁寧)[)）]$',x) for x in m]
    tag=next((h.group(1) for h in hon if h),None)
    m=[re.sub(r'[(（](尊敬|謙譲|丁寧|謙譲・丁寧)[)）]$','',x) for x in m]
    if tag and tag not in (note or ''): note=(tag+'語。'+(note or '')).strip()
    if n in OVR: m,note=OVR[n]
    POSFIX={4:('忍ぶ','動バ上二・四'),57:('被く','動カ四'),309:('給ふ','動ハ四'),310:('給ふ','動ハ下二')}
    if n in POSFIX: k,src=POSFIX[n][0],src[:2]+[POSFIX[n][1]]+src[3:]
    # 本の意味を優先。既存データの品詞（活用の種類つき）を使う
    e=exs.get(n) if exs.get(n) and len(exs.get(n))==len(m) else ([[src[4],src[5]]] if len(m)==1 and src[4] else None)
    out.append([n,w,k,src[2] if src[2] else pos,m,src[4],src[5],note,ch(n),src[8],rel.get(w,[]),e])
yomi=[]
for l in open(SP+'mm_yomi.tsv',encoding='utf-8'):
    a,kj,rd,mn,hist=l.rstrip('\n').split('\t'); yomi.append([int(a),kj,rd,mn,hist])
meta={'name':'古文330','lv':{1:'1章',2:'2章',3:'3章',4:'4章',5:'敬語'},'lvd':{1:'1章 読解必修語50',2:'2章 入試必修語100',3:'3章 入試重要語100',4:'4章 入試攻略語50',5:'最重要敬語30'}}
open(REPO+'src/book_data.js','w',encoding='utf-8').write('const BOOK_META='+json.dumps(meta,ensure_ascii=False)+';\nconst BOOK_RAW='+json.dumps(out,ensure_ascii=False)+';\nconst YOMI_RAW='+json.dumps(yomi,ensure_ascii=False)+';\n')
print('per-meaning examples',sum(1 for r in out if r[11]),'/',len(out));print('book',len(out),'related',sum(len(r[10]) for r in out),'yomi',len(yomi),'missing',len(missing),missing[:10])
