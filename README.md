# DIY Design Compiler

作りたいものの寸法と手持ちの材料を、**現実に製作可能な部材・木取り・組立手順へコンパイルする**Webアプリ。
要件は [`diy-ai-requirements.md`](./diy-ai-requirements.md) を参照。

## 設計方針

AI にすべてを任せない。責務をはっきり分ける（要件定義書 §4.1）。

| 層 | 担当 | 実装 |
| --- | --- | --- |
| 設計意図 | Intent の理解、構造と材料の選択 | `src/core/designEngine.ts` |
| 幾何 | Structure + 寸法 → 部材・接続 | `src/core/structures/` |
| 検証 | 定尺・シートに収まるか、たわみ・転倒 | `src/core/validator.ts` |
| 木取り | 1D Cutting Stock（kerf 込み）・板材配置 | `src/core/cutplan.ts` |
| 組立 | 手順と金物の集計 | `src/core/assembly.ts` |

AI 層が決めてよいのは「4本支柱型の棚にする」までで、「900mm の部材を4本」は
Geometry Engine が寸法から導出する。上の表の下 4 行はすべて決定論的で、
テストで不変条件を固定している。

現在の Design Engine はルールベース実装（`ruleBasedDesignEngine`）。
`DesignEngine` インターフェースを実装すれば LLM 呼び出しに差し替えられる。

## 実装済みの構造

- 4本支柱型シェルフ — 角材の骨格 + 棚板
- 箱型シェルフ — 板材のみ
- 壁付けシェルフ — 壁受け桟 + L字金具

## 動かす

```sh
npm install
npm run dev     # 開発サーバ
npm test        # コアエンジンのテスト
npm run build   # 型チェック + ビルド
```

## パイプライン

```
Intent / 寸法 / 手持ち材料
      ↓  designEngine     設計候補（構造 + 材料）
      ↓  structures       部材と接続
      ↓  validator        error / warning
      ↓  cutplan          どの材のどこを切るか
      ↓  assembly         どの順に組むか
   3D ビュー・三面図・部品表・木取り図・組立手順
```

`src/core/pipeline.ts` がこの流れをそのまま関数にしている。
`materialEfficiency` と `simplicity` のスコアは AI の自己申告ではなく、
木取り結果と部品点数の実測値で埋める。

## UI の考え方

日本の木材の定尺 **1820mm** を基準にした目盛りを全画面で共有する。
寸法入力・木取り図・図面が同じスケールの上に乗るため、
「材1本に対してどれくらいか」を数字を読まずに掴める。

候補の見分けも文章ではなく、Physical Model から起こした正面図で行う（§Principle 5）。
