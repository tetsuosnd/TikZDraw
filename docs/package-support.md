# パッケージとソース読込（v0.2）

## 作図と TeX 出力

| パッケージ | アプリで選べるもの | 主な出力 |
|---|---|---|
| tikz-feynhand | フェルミオン・反フェルミオン・スカラー・光子・グルーオン・ゴースト | `\vertex`、`\propag`、明示したベジェ制御点 |
| tikz-feynhand | 点・白抜き点・交差付き点・有効頂点 | dot / ringdot / crossdot / blob |
| circuitikz | 抵抗・コンデンサ・コイル・電圧源・電流源・電池・ダイオード・LED・スイッチ・配線 | R / C / L / V / I / battery1 / D / leD / nos / short |
| circuitikz | 接地、接続点、白抜き端子、米式／欧式 | ground / circ / ocirc、american / european、端子指定 |

粒子名・運動量・部品名・電圧・電流は LaTeX 数式として指定します（`$` は不要）。
運動量は左右の配置と反転、部品はラベルの側・invert・端子・記号サイズを設定できます。
電圧方向は RP 規約です。部品の invert と電圧ラベルの位置は別の設定として扱います。
頂点と接続点は色・サイズを保持します。頂点ラベルも設定できます。

初期状態で両専門パレットは非表示です。「追加パレット…」と「表示」メニューで個別に切替できます。
設定はこのマシンに保存し、図の JSON に含めません。パレットの表示に関係なく、
図に含まれる種類を見て必要なパッケージを TeX 出力へ指定します。

## ソース読込

ソースを TeX エンジンで実行せず、対応する文法を直接解析して編集可能な図形を作ります。
元の図形データをコメントへ埋め込む方式ではないため、ソース上で座標や部品を変更して読み戻せます。
図形への変換後は正規の書き出し形式になるので、元のコメントや空白は保持しません。

| 構文 | 対応 |
|---|---|
| 図の環境 | 単独の tikzpicture または circuitikz を 1 つ。単体 `.tex` も読込可 |
| 座標 | 明示的な数値、mm / cm / pt、図の x / y の単位。単位指定が無ければ 1 単位 = 1 cm |
| 通常図形 | 直線・折れ線、rectangle、circle の radius、ellipse の x/y radius、arc、controls によるベジェ曲線 |
| 文字 | 出力と同じ node 設定、`\fontsize`、通常文字のエスケープ、`$…$` の数式 |
| 色・線 | HTML 色定義、基本の色名、線幅・破線・点線・対応する Latex 矢印 |
| FeynHand | 本アプリが出力する長い粒子名、数値位置の vertex、直線 to または controls の propag、粒子名・mom/revmom |
| CircuiTikZ | 対応する部品の to、ラベル・電圧・電流・invert・端子、米式／欧式の scope と bipoles/length |
| 記号 | 本アプリが出力する頂点、接地、接続点 |

マクロ定義、独自スタイル、繰り返し、外部ファイル入力、plot、相対座標、
自動配置、FeynHand の half left などの自動経路設定は対象外です。
対応していないコマンドやオプションは明示して拒否し、元の図を保持します。
数式の内部には標準の LaTeX コマンドを指定できますが、KaTeX の対応範囲とは異なります。

「ソースを編集」中はキャンバスでの図形操作とプロパティの変更を止めます。
「図に反映」が成功すると編集可能な図へ戻り、1 回の Undo で直前の図へ戻せます。
解析エラーならソースを保持して再編集でき、「取消」で編集中のソースを破棄できます。
未保存ソースも終了時の保存確認・ドラフト復元の対象です。
`.tex` / `.tikz` を読み込んだ後の「保存」は `.tikzdraw` への保存先を尋ねます。

## 表示と検証

SVG の波線・コイル・記号・ラベルは編集用の概略です。実 TeX の描画とは
位相、曲線のサンプリング、線の太さ、記号寸法、矢印、ラベル配置が異なる場合があります。
最終確認は書き出した TeX をコンパイルした PDF で行ってください。

実装時は tikz-feynhand 1.1.0 と TeX Live 2026 に導入された circuitikz を使用し、
全種類のカタログ、各作図例、両パッケージ混在、ソース読込後の変更、日本語ラベルを実コンパイルします。
エラー・Overfull・Missing character の検査と、Poppler による表示確認を行います。

## 参照した一次資料

- [TikZ-FeynHand 公式](https://ctan.org/pkg/tikz-feynhand)と同梱 userguide：§2 の頂点・伝播線・ラベルと運動量・表示設定。
- [CircuiTikZ 公式](https://ctan.org/pkg/circuitikz)と同梱 manual：package options、bipoles、labels、currents and voltages、terminals。
- 導入済みの資料は `texdoc -l -I tikz-feynhand` / `texdoc -l -I circuitikz` で一覧表示できます。
