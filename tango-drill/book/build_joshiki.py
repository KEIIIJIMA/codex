# 古文常識データ（book/joshiki.tsv）から src/joshiki_data.js を生成する。
# 列: 分類, 語, 読み, 意味, ページ, [歴史的仮名遣い]。前半の行は読みが歴史的仮名遣いなので MODERN で現代仮名遣いに直す。
# 列の数の違いなど入力の不備は、飛ばさずにエラーで止める（inputs.py）。
import json,os,sys
HERE=os.path.dirname(os.path.abspath(__file__))+'/'
sys.path.insert(0,HERE)
from inputs import tsv
MODERN={'ゐのとき':'いのとき','いぬゐ':'いぬい','てあらひ':'てあらい','じふさんやのつき':'じゅうさんやのつき','いざよひのつき':'いざよいのつき','ゐまちのつき':'いまちのつき','ゆふづくよ':'ゆうづくよ','うるふづき':'うるうづき','やよひ':'やよい','しはす':'しわす','ふぢ':'ふじ','せちゑ':'せちえ','ぢもく':'じもく','ころもがへ':'ころもがえ','をみなへし':'おみなえし','をぎ':'おぎ','ごせちのまひ':'ごせちのまい','うすやう':'うすよう','ところあらはし':'ところあらわし','うぶやしなひ':'うぶやしない','いかのいはひ':'いかのいわい','うひかうぶり':'ういこうぶり','むじやうのかぜ':'むじょうのかぜ','しんわう':'しんのう','せつしやう・くわんぱく':'せっしょう・かんぱく','てんじやうびと':'てんじょうびと','くらうど':'くろうど','にようばう':'にょうぼう','ぢげ':'じげ','くわんゐ':'かんい','まうしぶみ':'もうしぶみ','このゑふ':'このえふ','けびゐし':'けびいし','へいあんきやう':'へいあんきょう','きよみづでら':'きよみずでら','あづま':'あずま','せいりやうでん':'せいりょうでん','てんじやうのま':'てんじょうのま','うへのみつぼね':'うえのみつぼね','よばふ':'よばう'}
SEC={'時刻':1,'方角':1,'一日':1,'月':1,'月の異名':2,'春':2,'春の行事':2,'夏':2,'夏の行事':2,'秋':2,'秋の行事':2,'冬':2,'冬の行事':2,'恋愛・結婚':3,'誕生・成長':4,'老い・死':4,'社会':5,'環境':6,'住居':7,'日常':8,'教養・遊び':9,'信仰':10}
IMG={'tachibana':['橘'],'hagi':['萩'],'ogi':['荻'],'gosechi':['五節の舞'],'kaimami':['垣間見','琴の音'],'fumi':['結び文'],'akatsuki':['暁','後朝'],'mikanoyo':['三日の夜'],'ika':['五十日の祝ひ','高杯','出だし衣'],'mogi':['裳着'],'kanmuri':['初冠'],'bukumo':['服喪'],'shinden':['寝殿造り','対の屋','渡殿','車宿','釣殿','築地','遣水','前栽'],'kyosoku':['脇息'],'shitsunai':['母屋','廂','御帳台','御簾','几帳','塗籠','格子','簀子','階'],'uchiki':['袿姿','蹴鞠'],'gissha':['牛車','女車','牛飼童'],'kangen':['琴','笙','篳篥','管絃'],'hentai':['女手','手習ひ'],'shirabyoshi':['今様','白拍子'],'aoi':['よりまし','物の怪','加持祈禱','験者'],'katatagae':['方違へ'],'rinne':['浄土','蓮の上','輪廻転生']}
FIG={'clock':None,'moon':None,'kani':['上達部','殿上人','地下','蔵人','参議','官位','頭'],'kisaki':['中宮','御息所','内侍','女房'],'kyo':['平安京','山','清水寺'],'dairi':['紫宸殿','清涼殿','殿上の間','後宮','上の御局']}
img={w:k for k,ws in IMG.items() for w in ws}; fig={w:k for k,ws in FIG.items() if ws for w in ws}
out=[]
for p in tsv(HERE+'joshiki.tsv',(5,6)):
    cat,w,rd,mean,page=p[:5]; hist=p[5] if len(p)>5 else ''
    if rd in MODERN: hist,rd=rd,MODERN[rd]
    f=fig.get(w,'')
    if cat in('時刻','方角'): f='clock'
    if cat=='月' and w!='閏月': f='moon'
    out.append([cat,w,rd,mean,int(page),hist,SEC[cat],img.get(w,''),f])
META={'name':'古文常識','lv':{1:'時刻・月',2:'季節',3:'恋愛・結婚',4:'成長・死',5:'社会',6:'環境',7:'住居',8:'日常',9:'教養・遊び',10:'信仰'},
 'lvd':{1:'1 時刻・方角・月',2:'2 季節の景物と行事',3:'3 恋愛〜結婚',4:'4 誕生・成長〜老い・死',5:'5 社会',6:'6 環境',7:'7 住居',8:'8 日常',9:'9 教養・遊び',10:'10 信仰'}}
open(os.path.dirname(HERE[:-1])+'/src/joshiki_data.js','w',encoding='utf-8').write('const JOSHIKI_META='+json.dumps(META,ensure_ascii=False)+';\nconst JOSHIKI_RAW='+json.dumps(out,ensure_ascii=False)+';\n')
ws=[r[1] for r in out]; print('items',len(out),'dup',[w for w in set(ws) if ws.count(w)>1],'img',sum(1 for r in out if r[7]),'fig',sum(1 for r in out if r[8]))
miss=[w for w in list(img)+list(fig) if w not in ws]; print('unmatched',miss)
