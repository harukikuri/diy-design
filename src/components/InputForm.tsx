import { useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { DEFAULT_KERF } from "../core/cutplan.ts";
import { MATERIALS, getMaterial } from "../core/materials.ts";
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

const STEPS = [
  { key: "intent", label: "作りたいもの", hint: "任意" },
  { key: "size", label: "仕上がり寸法", hint: "必須" },
  { key: "stock", label: "手持ちの材料", hint: "任意" },
] as const;

let stockKeySeq = 0;

interface Props {
  value: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  busy: boolean;
}

export function InputForm({ value, onChange, onSubmit, busy }: Props) {
  const [step, setStep] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);

  /*
   * 枠を固定すると内容の少ない段で余白が目立ち、内容任せにすると段を移るたびに
   * 高さが跳ねる。実測した中身の高さを変数に流し、CSS 側で遷移させて両方を避ける。
   * 材料を足したときの伸びにも追随させたいので ResizeObserver で見る。
   */
  useLayoutEffect(() => {
    const el = pane.current;
    if (!el) return;
    const apply = () =>
      body.current?.style.setProperty("--pane-h", `${el.scrollHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [step]);
  const patch = (part: Partial<FormState>) => onChange({ ...value, ...part });

  const numberHandler =
    (key: "width" | "height" | "depth" | "kerf") => (e: ChangeEvent<HTMLInputElement>) =>
      patch({ [key]: Number(e.target.value) } as Partial<FormState>);

  const addStock = (materialId: string) => {
    stockKeySeq += 1;
    const material = getMaterial(materialId);
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

  const sizeOk = value.width > 0 && value.height > 0 && value.depth > 0;
  const isLast = step === STEPS.length - 1;

  // 途中の段で Enter を押しても送信せず、次へ進める
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter" || isLast) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
    e.preventDefault();
    if (step === 1 && !sizeOk) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  return (
    <form
      className="panel wizard"
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <nav className="wizard__steps" aria-label="入力の段階">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className="wizard__step"
            aria-current={i === step}
            onClick={() => setStep(i)}
            disabled={i > 1 && !sizeOk}
          >
            <span className="wizard__step-no">{i + 1}</span>
            <span className="wizard__step-label">
              {s.label}
              <em>{s.hint}</em>
            </span>
          </button>
        ))}
      </nav>

      <div className="wizard__body" ref={body}>
        {step === 0 && (
          <section className="wizard__pane" ref={pane}>
            <h2 className="wizard__title">何を作りますか</h2>
            <p className="wizard__lede">
              書かなくても構いません。その場合は寸法と手持ちの材料から判断します。
            </p>
            <textarea
              className="input input--lg input--area"
              rows={4}
              placeholder={"例: 本をたくさん置ける頑丈な棚。\n子どもが登っても倒れないようにしたい。"}
              value={value.intent}
              onChange={(e) => patch({ intent: e.target.value })}
            />
            <div className="chips chips--lg">
              {INTENT_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="chip"
                  aria-pressed={value.intent === example}
                  onClick={() => patch({ intent: example })}
                >
                  {example}
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="wizard__pane" ref={pane}>
            <h2 className="wizard__title">仕上がり寸法</h2>
            <p className="wizard__lede">
              完成したときの外形です。目盛りは木材の定尺 1820mm を表します。
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
          </section>
        )}

        {step === 2 && (
          <section className="wizard__pane" ref={pane}>
            <h2 className="wizard__title">手持ちの材料</h2>
            <p className="wizard__lede">
              余っている木材があれば選んでください。使い切れる設計を優先します。
              未入力なら、すべて新しく買う前提で木取りします。
            </p>

            <div className="catalog">
              {MATERIALS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="catalog__item"
                  onClick={() => addStock(m.id)}
                >
                  <span className="catalog__name">{m.name}</span>
                  <span className="catalog__spec num">
                    {m.kind === "lumber"
                      ? `${m.thickness}×${m.width}mm`
                      : `厚 ${m.thickness}mm / ${m.width}mm 幅`}
                  </span>
                  <span className="catalog__spec num">
                    定尺 {m.standardLengths.join(" / ")}mm
                  </span>
                  <span className="catalog__add">+ 追加</span>
                </button>
              ))}
            </div>

            {value.stock.length > 0 && (
              <div className="stock-head">
                <span>材料</span>
                <span>長さ</span>
                <span>数量</span>
                <span />
              </div>
            )}
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
          </section>
        )}
      </div>

      <footer className="wizard__foot">
        <button
          type="button"
          className="btn"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          戻る
        </button>
        {/*
          key を分けて別のノードにする。同じノードを使い回すと、
          「次へ」を押した再描画で type が submit へ変わり、
          そのクリックがそのまま送信として扱われてしまう。
        */}
        {isLast ? (
          <button
            key="submit"
            className="btn btn--primary"
            type="submit"
            disabled={busy || !sizeOk}
          >
            {busy ? "計算中…" : "設計する"}
          </button>
        ) : (
          <button
            key="next"
            type="button"
            className="btn btn--primary"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 1 && !sizeOk}
          >
            次へ
          </button>
        )}
      </footer>
    </form>
  );
}
