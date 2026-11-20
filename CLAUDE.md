# TikZ Draw 開発案内

Electron のデスクトップドローアプリ。UI・文書は日本語、識別子は英語。
`AGENTS.md` はこのファイルへの相対 symlink とする。

## 実行と検証

Node.js 22.12 以上で `npm ci`、`npm start`。`npm run build:mac` で
`dist/TikZ Draw.app` を生成する。Finder から直接起動できる。
単体検査は `npm test`、実 Electron の統合検査は `npm run test:desktop`。
`npm run examples` は書き出し例を生成する。TeX の検証には TeX Live と Poppler を使う。
`npm run test:tex` は単体 TeX・日本語・本文への TikZ 読込をコンパイルし、PNG にレンダーする。

## 構造

| 場所 | 役割 |
|---|---|
| `core/document.mjs` | 保存形式の検証・座標操作・TikZ 生成 |
| `core/specials.mjs` | 専門図形の選択肢・検証・出力・幾何補助 |
| `core/import-tex.mjs` | 対応する TeX 構文を図形へ戻すパーサ |
| `core/examples-specials.mjs` | Feynman 図・回路図・混在図の作図例 |
| `desktop/main.mjs` | ネイティブダイアログ・ファイル保存・メニュー |
| `desktop/preload.cjs` | 限定した IPC API |
| `ui/` | SVG キャンバス・操作履歴・プロパティ・KaTeX 表示 |
| `ui/specials.mjs` | 専門記号の SVG 概略表示 |
| `test/` | 形式・出力・実アプリ操作の検査 |

最新状態は `SESSION.md`、設計判断は `DESIGN.md`、引き継ぎは `handovers/`。
作業再開時はそれらと最新の引き継ぎを読む。
パッケージの出典とソース読込の範囲は `docs/package-support.md`。
専門パレットは初期状態で非表示。表示設定は図面とは別のローカル設定である。
