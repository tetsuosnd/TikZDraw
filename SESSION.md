# 現在状態（2026-11-21）

初版 v0.1.0 を実装した。macOS、Electron 45.4.1、日本語 UI。
`dist/TikZ Draw.app` を生成し、同梱した画面・KaTeX・IPC が動くことを実アプリで確認した。
直線・矢印・折れ線・長方形・円・楕円・円弧・ベジェ曲線・文字・数式ラベルに対応する。
制御点編集、数値による移動・サイズ指定、複数選択、線と塗り、前後順、複製、Undo/Redo、
保存・再読込、TikZ/単体 TeX 出力、未保存ドラフト復元を実装した。

## 検証

| 検査 | 結果 | 最後の実測 |
|---|---|---|
| `npm test` | 9 件 PASS | 0.561 s |
| `npm run test:desktop` | 12 件 PASS | 6.584 s |
| `npm run test:tex` | 単体 2 件・日本語 1 件・本文読込 1 件 PASS | 3.922 s |
| `npm run build:mac` | .app 生成・ad-hoc 署名検証 | 1.807 s |
| `.app --smoke-test=…` | 同梱ファイルによる起動・sandbox・数式・IPC を確認 | 4.297 s |
| `npm run format:check` | PASS | — |

TeX の 4 件はエラー・Overfull・Missing character が無いことを検査し、
Poppler で描画して見た目も確認した。検証用スクリーンショットは `test-output/`、
代表画面は `assets/screenshot.png`。生成 PDF は `examples/` に保存。

## 初版の境界

Windows の配布確認、Developer ID 署名・公証、任意の TikZ/WinTpic ファイルの読込は未対応。
KaTeX の編集時表示と実 TeX は対応コマンド・字形が完全には一致しない。
ソースの private remote は `tetsuosnd/TikZDraw`。
remote は作成済み、ローカル commit 済み。push は自動承認レビューが
「ソース一式と宛先への明示承認が必要」として拒否したため、ユーザーの返答待ち。
`tetsuosnd-prefs/repos.md` の追加 1 行も同じ確認に含めている。
