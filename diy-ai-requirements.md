# DIY AI プロジェクト 要件定義書

> Version: 0.1  
> Status: Draft  
> Date: 2026-09-03

---

# 1. プロジェクト概要

## 1.1 プロダクトコンセプト

本プロジェクトは、ユーザーのDIYに関する意図、寸法、利用可能な材料などの条件から、実際に製作可能なDIY作品を設計するAIアプリケーションである。

単なる「DIYアイデアを文章で提案するAI」ではなく、

**Intent → Structure → Geometry → Parts → Cut Plan → Assembly**

という設計パイプラインによって、ユーザーの要求を現実に製作可能な構造へ変換することを目指す。

最終的な体験は、以下のようなものとする。

1. ユーザーが作りたいもの、または持っている材料を入力する
2. AIが複数のDIYデザイン候補を生成する
3. ユーザーが完成イメージまたは3Dモデルから候補を選択する
4. システムが物理的な部品構成を計算する
5. 材料からの最適な切り出し方法を計算する
6. IKEAの組み立て説明書のような視覚的な手順を提供する

---

# 2. 背景・課題

既存の生成AIはDIYについて以下のような回答を得意とする。

- 「棚を作る方法」を文章で説明する
- 必要な材料を列挙する
- 手順を文章で説明する
- DIYアイデアを提案する

しかし、実際のDIYではユーザーが必要としているのは文章だけではない。

DIYには以下のような物理的制約が存在する。

- 材料の寸法
- 完成品の寸法
- 部材の配置
- 切断可能性
- 材料の余り
- 部品同士の接続
- 組み立て順序

そのため、本プロダクトでは自然言語による説明を中心にせず、

**立体的・視覚的・物理的な情報を中心としたDIY設計体験**

を提供する。

IKEAの組み立て説明書のように、言語に依存せず視覚的に理解できるアウトプットを重要なUX目標とする。

---

# 3. プロダクトビジョン

## 3.1 最終ビジョン

> **言葉や材料を入力すると、現実に作れるモノへコンパイルする。**

本プロダクトを以下のような「DIY Design Compiler」と位置づける。

```text
User Input
    ↓
Design Intent
    ↓
Structure
    ↓
Geometry
    ↓
Physical Parts
    ↓
Cut Plan
    ↓
Assembly Plan
    ↓
Visual Manual
```

---

# 4. 基本設計思想

## 4.1 AIと決定論的システムの責務分離

AIにすべてを任せない。

### AIの責務

AIは以下を担当する。

- ユーザーのIntentを理解する
- DIYデザイン候補を考える
- 適切な構造パターンを選択する
- 複数のDesign Candidateを生成する

### システムの責務

プログラムは以下を担当する。

- 寸法計算
- Geometry生成
- 必要なPartの算出
- Materialとの整合性検証
- Cut Plan最適化
- 接続方法の検証
- Assembly順序の生成

```text
AI
「どんな構造にするか」
        ↓
Program
「実際に作れる形へ変換する」
```

---

# 5. ユーザー入力

## 5.1 必須情報

### Dimensions

完成品または対象物の3次元寸法。

```text
Width
Height
Depth
```

単位は内部的にmmへ統一する。

DimensionsはDIYの種類に応じて動的に変更しない。

棚、有孔ボード、デスクなど、すべてのDIY対象について基本的に3次元寸法を扱う。

---

## 5.2 Intent

ユーザーの目的。

例：

- 棚を作りたい
- デスクを作りたい
- 収納を作りたい
- 有孔ボードを設置したい

ただしIntentは固定カテゴリのみを強制しない。

以下のようなケースも想定する。

> 「この材料で何か作りたい」

そのため、

```text
Intentあり + Materialなし
Intentあり + Materialあり
Intentなし + Materialあり
```

を許容する。

---

## 5.3 Optional: Available Materials

ユーザーが既に持っている材料。

例：

```text
2×4材
38 × 89 × 1820mm
3本

合板
910 × 1820 × 12mm
1枚
```

材料は抽象的な「木材」ではなく、可能な限り実際の物理的な在庫単位として扱う。

---

## 5.4 Optional: Space

設置場所に関する情報。

例：

- 部屋
- 壁
- 設置可能範囲
- 周辺の障害物

MVPでは必須としない。

---

# 6. UXフロー

## 6.1 基本フロー

```text
Input
│
├── Intent
├── Dimensions
├── Materials (Optional)
└── Space (Optional)
        ↓
      AI
        ↓
Design Candidates
        ↓
┌─────────────────────┐
│ Design A            │
│ 🖼️ Image / 🧊 3D    │
├─────────────────────┤
│ Design B            │
│ 🖼️ Image / 🧊 3D    │
├─────────────────────┤
│ Design C            │
│ 🖼️ Image / 🧊 3D    │
└─────────────────────┘
        ↓
User Selects
        ↓
Detailed Design
        ↓
IKEA-style Manual
```

---

## 6.2 Design Candidate

ユーザーには複数の完成候補を提示する。

Design A / B / Cは、単なる色違いではなく、可能な限り異なる構造・製作方法を持つ候補とする。

候補の視覚化方法：

- 生成画像
- 3Dモデル
- 将来的には両方

ユーザーは視覚的に候補を選択する。

---

# 7. ドメインモデル

プロダクトの物理的な中心モデルは以下とする。

```text
Stock
  ↓
Cut
  ↓
Part
  ↓
Connection
  ↓
Assembly
```

---

# 8. Material / Stock

## 8.1 Material

材料の種類を表す。

例：

- 2×4材
- 1×4材
- 合板
- MDF

## 8.2 Stock

ユーザーが実際に持っている、または購入する物理的な材料単位。

例：

```text
2×4材 #1
38 × 89 × 1820mm

2×4材 #2
38 × 89 × 1820mm
```

数量をまとめて管理するだけでなく、将来的には1本・1枚単位で追跡可能にする。

---

# 9. Structure Schema

## 9.1 Structureの定義

Structureとは、

> **完成品のカテゴリではなく、物理的な構成方法**

である。

例：

```text
Shelf
```

というIntentに対して、

- Four Post Shelf
- Box Shelf
- Wall Shelf

など複数のStructureが存在する。

---

## 9.2 MVP Structure

```typescript
type StructureType =
  | "four_post_shelf"
  | "box_shelf"
  | "wall_shelf";
```

MVPでは対応するStructureを限定する。

---

## 9.3 Structure Candidate

AIが生成する設計候補。

```typescript
interface DesignCandidate {
  id: string;
  structure: Structure;
}
```

将来的には以下の評価値を持つ。

```typescript
score: {
  stability: number;
  materialEfficiency: number;
  simplicity: number;
}
```

---

# 10. Geometry Engine

## 10.1 役割

Geometry Engineは、

```text
Structure
+
Dimensions
+
Material Properties
```

から、

```text
Physical Parts
```

を生成する。

---

## 10.2 原則

AIが直接、

```text
900mmの部材を4本
```

と決定することを避ける。

AIは、

```text
4本支柱型の棚
```

というStructureを決める。

Geometry Engineが、

```text
Width
Height
Depth
Material dimensions
```

から実際の部品寸法を計算する。

---

# 11. Parts

Partは完成品を構成する物理的な部品。

例：

```text
Vertical Post
1800mm

Horizontal Support
1124mm

Shelf Surface
1124 × 400 × 12mm
```

Partは以下の情報を持つ。

- ID
- Structural Role
- Dimensions
- Material
- 3D Transform

---

# 12. Connection / Joint

Partだけでは完成品は成立しない。

Part同士が、

> どのように接続されているか

をモデル化する。

MVP候補：

```text
screw
bolt
bracket
glue
```

将来的には、

- ダボ
- ほぞ
- 組み木

などへ拡張する。

---

# 13. Cut Plan Engine

## 13.1 役割

Cut Plan Engineは、

```text
Required Parts
+
Available Stock
```

から、

```text
どのStockから
どのPartを切り出すか
```

を決定する。

---

## 13.2 問題領域

MVPでは1D Cutting Stock Problemを対象とする。

例：

```text
Stock

1820mm × 3
```

から、

```text
900mm × 2
600mm × 3
```

を切り出す。

---

## 13.3 Kerf

切断時の刃幅を考慮する。

```text
Part
+
Kerf
+
Part
```

として必要な材料長を計算する。

---

## 13.4 MVP Algorithm

MVPでは以下のアルゴリズムを採用する候補とする。

- First Fit Decreasing
- Best Fit Decreasing

より高度な最適化は将来対応とする。

---

# 14. Assembly Engine

Assembly Engineは、

```text
Parts
+
Connections
```

から、

> **どの順番で組み立てるか**

を生成する。

例：

```text
Step 1
フレームを作る

Step 2
棚板を取り付ける

Step 3
補強材を取り付ける
```

ただし、最終的なUIでは文章を中心にしない。

---

# 15. Visual Manual

## 15.1 UX目標

IKEAの組み立て説明書のように、

- 言語依存を減らす
- 視覚的に理解できる
- 現在の作業対象が明確
- 部品と接続方法が明確

な説明を提供する。

---

## 15.2 表示内容

各Stepについて、

- 使用するPart
- 使用するFastener
- 接続位置
- 完成状態

を視覚的に表示する。

---

# 16. 3D Rendering

3D Rendererは同一のPhysical Modelを利用する。

```text
Parts
+
Transforms
+
Connections
```

から3Dモデルを描画する。

3Dは単なる完成イメージではなく、

- 設計確認
- 部品配置確認
- Assembly手順
- Exploded View

にも利用する。

---

# 17. MVPスコープ

## MVPで実装する

### Input

- Intent
- Width
- Height
- Depth
- Available Materials

### Material

- Lumber（角材）
- Board（板材）

### Structure

まず少数のStructureに限定する。

例：

- Four Post Shelf
- Simple Box Shelf

### Design

- 3つ程度のDesign Candidate生成

### Geometry

- Structure → Parts

### Cut Plan

- 1D Lumber Cutting
- Kerf対応
- Best Fit / First Fit

### Visualization

- 基本的な3D表示

---

# 18. MVPで実装しない

以下は将来の拡張対象。

- ホームセンターの商品データベース
- 店舗ごとの在庫情報
- リアルタイム価格
- 2D板材の高度なCutting Optimization
- すべての木工ジョイント
- 構造強度の完全な工学計算
- ARによる設置確認
- 実際の部屋の自動3Dスキャン

---

# 19. 推奨技術スタック

## Frontend

```text
React
TypeScript
```

## 3D

候補：

```text
Three.js
React Three Fiber
```

## Backend

候補：

```text
TypeScript / Node.js
```

またはAI・最適化処理の分離が必要になった場合、

```text
TypeScript Frontend
+
Python Optimization Service
```

も検討する。

---

# 20. AIの役割

AIは以下を担当する。

```text
Natural Language
      ↓
Intent Understanding
      ↓
Structure Candidates
      ↓
Design Explanation / Metadata
```

AIが以下を直接決定することは避ける。

```text
Physical dimensions
Cut optimization
Material arithmetic
Geometric validation
```

これらは決定論的なEngineで処理する。

---

# 21. System Architecture

```text
┌─────────────────────┐
│ User Input          │
│                     │
│ Intent              │
│ Dimensions          │
│ Materials           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ AI Design Engine    │
│                     │
│ Structure Candidates│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Structure Compiler  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Geometry Engine     │
│                     │
│ Physical Parts      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Validator           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Cut Plan Engine     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Connection Engine   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Assembly Engine     │
└──────────┬──────────┘
           │
           ├──────────────┐
           ▼              ▼
      3D Renderer    Visual Manual
```

---

# 22. 最重要な設計原則

## Principle 1

> **AIは設計意図を扱う。**

## Principle 2

> **Geometryはプログラムが計算する。**

## Principle 3

> **材料は抽象的なカテゴリではなく、現実の物理的なStockとして扱う。**

## Principle 4

> **完成品ではなく、Structureを中心に設計する。**

## Principle 5

> **最終アウトプットは文章ではなく視覚情報を中心にする。**

## Principle 6

> **すべての設計は最終的に現実のPartsへコンパイル可能でなければならない。**

---

# 23. 将来ビジョン

最終的にはユーザーが、

```text
「この材料で何か作りたい」
```

と言うと、

```text
Available Stock
        ↓
AI + Structure Search
        ↓
Possible Designs
        ↓
User Selects
        ↓
Geometry
        ↓
Cut Optimization
        ↓
Assembly
        ↓
Visual Manual
```

という体験を提供する。

また、

```text
「このサイズの棚を作りたい」
```

というIntent-firstの利用と、

```text
「この余った木材を使いたい」
```

というMaterial-firstの利用を、同じドメインモデルで扱えることを最終目標とする。

---

# 24. プロダクトの一文定義

> **DIY AIは、ユーザーのIntent・Dimensions・Materialsを入力として、現実に製作可能なDIY構造を生成し、材料・部品・切断計画・組み立て手順へコンパイルするVisual DIY Design Systemである。**
