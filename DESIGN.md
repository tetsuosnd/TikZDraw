# 設計判断

- Electron を採用する（ユーザー指定）。SVG と素の ES modules で構成し、UI のビルド工程を省く。
- 作図モデルを唯一の正本とし、SVG と TikZ の両方をそこから生成する。
  座標は左上原点の mm。TikZ 出力時に用紙高さから y を引いて数学の座標系へ変換する。
- 線幅・文字サイズは TeX pt。SVG へは 25.4 / 72.27 mm に換算する。
- 再編集用 JSON と出力用 TikZ は用途を分ける。任意の手書き TikZ を逆解析する機能は初版の対象外。
- 数式の編集時表示にはローカルの KaTeX を使い、ソースはそのまま TeX に渡す。
  KaTeX と TeX の対応範囲・字形は同一ではない。出力の最終確認は実 TeX で行う。
- ウインドウは sandbox・contextIsolation を有効にし Node integration を無効にする。
  ファイルへのアクセスはメインプロセスがネイティブダイアログで選んだ場所に限る。
  外部コンテンツ・外部通信は使わない。
- 英数字の単体 TeX は pdflatex、日本語を含むときは LuaLaTeX と luatexja を選ぶ。
- macOS の .app はローカル検証用。署名・公証と Windows 版の配布確認は別途必要。
