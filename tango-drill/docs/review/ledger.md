# 作業台帳 — 単語ドリル「1から順番に全部直して」（2026-11-15 依頼）

圧縮後はこの台帳と git log を信頼すること。

## 前提
- リポジトリ: /home/user/codex（アプリは tango-drill/）。開発ブランチ claude/adoring-maxwell-ch06ga。公開は main へ PR→マージ→Pages。
- 利用者の方針: 変更は公開版に反映する（PR 作成・マージ・デプロイ確認まで）。個人用ページ https://claude.ai/artifact/HshjAJEGdPsgw6Hq4KejCE も scratchpad/book.html から更新。
- 検証済みの指摘（修正リスト）: scratchpad/review/fix/<area>.md / .json（kobun 35, eigo 9, tables 30, bungaku 17, waka 12, joshiki 17, figs 7, book 167, app 59, learning 14, design 44）
- 元データ: scratchpad/review/merged/*.json。デザイン試作: scratchpad/review/design-mock/override.css
- 補助: scratchpad/review/dump.js（DUMP_HTML で対象を指定可）、preview_build.js <outdir>、idcheck/ids.js
- 公開中の版（ID の基準）: main bc11a15（PR #18）

## 段階（Task ツールの #1〜#6 と対応）
- 1a 内容・転記の訂正（古文330以外）: ワークフロー P1a（実装→レビュー→手直し）。所有ファイルを担当ごとに分離
- 1b 記録の引き継ぎ: P1a の担当 F（テンプレート・build.js・tools・tests）。移行表は全修正後に自分で作る
- 1c 古文330: 索引10ページを読み直し→差分→検証→訂正。番号変更の移行表（b:番号、br:番号:順）
- 2 使い勝手 / 3 デザイン / 4 学習設計: テンプレート1ファイルなので直列で実装

## 決定（Ruling）
- 実装担当は commit しない（同じ作業ツリーで並行するため）。レビュー後に自分でまとめて commit — 履歴が粗くなるが衝突しない
- ID が変わる修正は許可するが、必ず id_changes に報告させ、移行表に入れる
- アプリ側で直すべき指摘（空所補充に出ない語、4択の選択肢など）は 1 では直さず 2 で対応

## 進行記録
- (ここに追記)
- 11/16 00:1x UTC: P1a ワークフロー開始。Task ID wuqppvyi5 / Run ID wf_1912d5be-f90 / スクリプト workflows/scripts/tango-drill-fix-phase1a-wf_f3ab4b8d-128.js。担当: kobun, eigo, tables→bungaku(waka含む), joshiki(yomi含む), infra(移行の仕組み＋図)。レビューは bc11a15 との差分で行うので、途中の WIP コミットは可
- P1a 完了後にやること: 全体ビルド（build_book.py → build_joshiki.py → build_extra.py → node build.js）、ID の差分から移行表を作る、テスト、PR→マージ→デプロイ確認、個人用ページ更新、tools/update_baseline.js
- その次: 1c 古文330（索引の読み直しワークフロー）
- 11/16 12:05 UTC: P1a を再開（Task ID は直後の起動結果を参照、Run は wf_1912d5be-f90 から resume）。eigo・tables・joshiki は実装済み（レビュー待ち）、kobun・bungaku・infra は未実装だった
- 11/16 13:0x UTC: 1a・1b 完了。PR #19 マージ（main b4e0fc4）。移行 v1 公開、基準は 版1・3697件。P1a の結果は review/merged/p1a.json
- 見送り: kobun #34 やむなし（保留）、tables #26（本に無い注記の印付け）、空所補充・4択関連はフェーズ2
- 次: 1c 古文330。索引PDF 3本・計10ページを1ページずつ全件読み取り → データと機械的に差分 → 切り抜きで検証 → 訂正＋移行 v2（b:番号 / br:番号:順 の対応表は必須。検査では検出できない）
- 11/16 13:5x UTC: 索引の書き起こし完了（review/index/idx*_p*.json、見出し語330・番号1〜330そろう。idx3 には古文常識語の索引も含まれ t:"r" で入っている＝関連語ではない）。差分は review/index/diff.js → diff.json（番号違い40＋表記違い6、意味の違い168、関連語の不足 約30、親の違い60）
- 方針: 古文330の番号・見出し・品詞・意味・ページは索引の書き起こしを正とする。関連語は索引の語形・意味を正とし、親は既存データを優先。意味が変わる語は意味別用例を作り直す。移行 v2 は見出し語の一致で旧→新の対応表を作る
- 11/16 14:1x UTC: 1c ステップB完了（自分でスクリプト実行）。review/index/rebuild.js が mm_numbered.tsv / mm_related.tsv / mm_new97.json / exs_out_*.json を索引どおりに書き換え済み（再実行しない）。対応表 pairs.json、付け替え表 mig_v2.json（82件、null=削除 は b:290 のみ）、用例見直しの入力 index/step_c/in_01..15.json
- build_book.py: splitm が「｜」区切りに対応、p1 は括弧なしの語で引く。migrate と check_ids は値 null（削除）に対応（テスト未追加）
- 未了: ステップC（全330語の用例・品詞・注を見直し → step_c/out_NN.json）→ 取り込み（exs_out、book_overrides）→ migrations.json に v2 → テスト（旧ID→同じ語になるか全件）→ 公開
- 既知: No.15 よし（形容詞なのに由の内容）、No.207 あつし（形シク）、No.264 くやし・No.289 させる は元データなし → ステップCで作る
- 11/16 14:2x UTC: ステップC ワークフロー開始 Task wkc071pcu / Run wf_6808d3bb-3f7（15バッチ: write(opus)→verify(fable)→fix(fable)）。結果は index/step_c/out_NN.json（1語: num,w,kanji,pos,note,tags,examples,changed,why,concern）。17:15 UTC に自分用の確認を予約済み
- 取り込みの設計: out_*.json → book/exs_out_1.json に全330語（{num,exs}）、exs_out_2/3 は空に。kanji/pos/note/tags は book/book_overrides.json（num をキー）にして build_book.py の最後で上書き。その後 migrations.json に v2（index/mig_v2.json）を追加、tests に「旧ID→同じ語」の全件テストと null（削除）のテストを追加
- 11/16 17:2x UTC: ステップC 再開（Task w5czxuic0、Run wf_6808d3bb-3f7 を resume）。write は全15組済み、verify 05〜15 と fix が残り
- 準備済み: review/index/integrate.js（out_*.json → book/exs_out_1.json と book/book_overrides.json。何度でも実行可）、build_book.py は book_overrides.json を読む、tests/book_renumber.test.js と tests/fixtures/book_v1.json（旧ID→同じ語の全件テスト、null の削除テスト）
- ワークフロー完了後の手順: node review/index/integrate.js → python3 book/build_book.py（330/330 になること）→ src/migrations.json に {v:2, map: index/mig_v2.json} を追加 → node build.js → node --test → scratch のブラウザテスト → tools/update_baseline.js → commit → PR → merge → デプロイ確認 → 個人用ページ更新 → 報告
- 11/16 18:0x UTC: 1c 完了。PR #20 マージ（main 9c8f9d3）。移行 v2 公開、基準は 版2・3702件。テスト47件
- 残った気づき（フェーズ2以降で検討）: 括弧つき見出し語の表示と空所補充、同じ語形の関連語カード（なでふ）、tags「多義語」が意味1つの語に残る（おろかなり・めざまし等）、かたらふ→たどる の親、ステップCの minor 指摘は未反映（index/step_c の verify 結果は tasks/w5czxuic0.output）
- 次: フェーズ2（使い勝手）。テンプレート1ファイルなので直列。修正リスト fix/app.md（59件）＋ kobun/book の「アプリ側で対応」分（空所補充の照合、選択肢）＋アプリ内の使い方案内
- 11/16 18:1x UTC: フェーズ2 開始。指示書 review/p2/task-N-brief.md（N=1..6、mkbriefs.js で生成）、報告 task-N-report.md、タグ p2-task-N-base。ワークフロー Task wloo3ufii / Run wf_1a7ae1ab-cbe（直列: 実装→レビュー→手直し最大2回、最後に全体レビュー）。実装担当が自分でコミットする（push は自分）。22:25 UTC に自分用の確認を予約
- フェーズ2 で扱わない app 指摘（フェーズ3 デザインへ）: 7, 8, 32〜36, 38, 39。見送り: 14（挿絵の埋め込み）, 40（Google Fonts）, 41（PWA）はフェーズ3で判断。50, 53, 56 は対象外（英単語のレベル配分・訳語表記）
- フェーズ2 完了後: node build.js / node --test / scratch テスト → tools/update_baseline.js は ID が変わらないので不要（念のため検査 OK を確認）→ PR → merge → デプロイ確認 → 個人用ページ → 報告
- 11/16 19:0x UTC: コンテナ再起動でフェーズ2のワークフローが停止。リポジトリと scratchpad は残っていた。タスク1は完了（コミット 9905fa4、レビュー approved、push 済み）。タスク2の途中（タグ p2-task-2-base あり、未コミットの変更あり）から再開: Task wckp2k6x3（Run wf_1a7ae1ab-cbe を resume）
- TODO（フェーズ2完了後すぐ）: scratchpad が消えても続けられるよう、台帳・fix/design.md・fix/learning.md・design-mock/override.css をリポジトリ（tango-drill/docs/review/）に控えとしてコミットする
- 11/16 22:26 UTC: フェーズ2 再開（タスク2の実装が上限で停止していた）。Run wf_1a7ae1ab-cbe を resume。次の確認を 03:35 UTC に予約
