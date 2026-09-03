import type { ChangeEvent } from "react";
import { MATERIALS, getMaterial } from "../core/materials.ts";
import { DEFAULT_KERF } from "../core/cutplan.ts";
import { Scale, STANDARD_SPAN } from "./Scale.tsx";

export interface StockInput {
  key: string;
  materialId: string;
  length: number;
  quantity: number;
}

export interface FormState {
  intent: string;
  width: number;
  height: number;
  depth: number;
  stock: StockInput[];
  kerf: number;
}

export const initialForm: FormState = {
  intent: "",
  width: 800,
  height: 1800,
  depth: 400,
  stock: [],
  kerf: DEFAULT_KERF,
};

const INTENT_EXAMPLES = [
  "本をたくさん置ける頑丈な棚",
  "壁に浮かせて省スペースにしたい",
  "初心者でも作れる収納",
  "この2×4材で何か作りたい",
];

let stockKeySeq = 0;

interface Props {
  value: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  busy: boolean;
}

export function InputForm({ value, onChange, onSubmit, busy }: Props) {
  const patch = (part: Partial<FormState>) => onChange({ ...value, ...part });

  const numberHandler =
    (key: "width" | "height" | "depth" | "kerf") => (e: ChangeEvent<HTMLInputElement>) =>
      patch({ [key]: Number(e.target.value) } as Partial<FormState>);

  const addStock = () => {
    stockKeySeq += 1;
    const material = MATERIALS[0];
    patch({
      stock: [
        ...value.stock,
        {
          key: `s${stockKeySeq}`,
          materialId: material.id,
          length: material.standardLengths[0],
          quantity: 1,
        },
      ],
    });
  };

  const updateStock = (key: string, part: Partial<StockInput>) =>
    patch({ stock: value.stock.map((s) => (s.key === key ? { ...s, ...part } : s)) });

  const removeStock = (key: string) =>
    patch({ stock: value.stock.filter((s) => s.key !== key) });

  const dimensions = [
    { key: "width", label: "幅 W", value: value.width },
    { key: "height", label: "高さ H", value: value.height },
    { key: "depth", label: "奥行 D", value: value.depth },
  ] as const;

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="panel__head">
        <h2 className="panel__title">作りたいもの</h2>
        <span className="eyebrow">Input</span>
      </div>

      <div className="panel__body">
        <label className="field">
          <span className="field__label">
            何を作りますか
            <span className="field__hint">任意</span>
          </span>
          <input
            className="input"
            type="text"
            placeholder="例: 本をたくさん置ける頑丈な棚"
            value={value.intent}
            onChange={(e) => patch({ intent: e.target.value })}
          />
        </label>
        <div className="chips">
          {INTENT_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              onClick={() => patch({ intent: example })}
            >
              {example}
            </button>
          ))}
        </div>

        <p className="field__label" style={{ marginTop: 18 }}>
          仕上がり寸法
          <span className="field__hint">定尺 1820mm との比較</span>
        </p>
        {dimensions.map((dim) => (
          <div className="dim" key={dim.key}>
            <div className="dim__row">
              <span className="dim__name">{dim.label}</span>
              <input
                className="input input--num"
                type="number"
                min={0}
                step={10}
                value={dim.value}
                onChange={numberHandler(dim.key)}
                aria-label={`${dim.label} (mm)`}
              />
            </div>
            <div className="dim__scale">
              <Scale span={STANDARD_SPAN} value={dim.value} minor={100} major={500} />
            </div>
          </div>
        ))}

        <div className="settings">
          <p className="field__label">
            手持ちの材料
            <button type="button" className="btn btn--ghost" onClick={addStock}>
              + 追加
            </button>
          </p>
          {value.stock.length === 0 ? (
            <p className="field__hint">
              未入力なら、すべて新しく買う前提で木取りします。
            </p>
          ) : (
            <>
              <div className="stock-head">
                <span>材料</span>
                <span>長さ</span>
                <span>数量</span>
                <span />
              </div>
              {value.stock.map((s) => (
                <div className="stock-row" key={s.key}>
                  <select
                    className="select"
                    value={s.materialId}
                    onChange={(e) => {
                      const material = getMaterial(e.target.value);
                      updateStock(s.key, {
                        materialId: material.id,
                        length: material.standardLengths[0],
                      });
                    }}
                    aria-label="材料"
                  >
                    {MATERIALS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input input--num"
                    type="number"
                    min={1}
                    step={10}
                    value={s.length}
                    onChange={(e) => updateStock(s.key, { length: Number(e.target.value) })}
                    aria-label="長さ (mm)"
                  />
                  <input
                    className="input input--num"
                    type="number"
                    min={1}
                    step={1}
                    value={s.quantity}
                    onChange={(e) => updateStock(s.key, { quantity: Number(e.target.value) })}
                    aria-label="数量"
                  />
                  <button
                    type="button"
                    className="stock-row__remove"
                    onClick={() => removeStock(s.key)}
                    aria-label="この材料を削除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <details className="settings">
          <summary>切断の設定</summary>
          <label className="field" style={{ marginBottom: 0 }}>
            <span className="field__label">
              切り代 (kerf)
              <span className="field__hint">のこ刃の厚み</span>
            </span>
            <input
              className="input input--num"
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={value.kerf}
              onChange={numberHandler("kerf")}
            />
          </label>
        </details>

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "計算中…" : "設計する"}
        </button>
      </div>
    </form>
  );
}
