import { useState } from "react";
import { ruleBasedDesignEngine } from "./core/designEngine.ts";
import { createStock } from "./core/materials.ts";
import type { PipelineResult } from "./core/pipeline.ts";
import { runPipeline } from "./core/pipeline.ts";
import type { FormState } from "./components/InputForm.tsx";
import { InputForm, initialForm } from "./components/InputForm.tsx";
import { Scale, STANDARD_SPAN } from "./components/Scale.tsx";

export default function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [busy, setBusy] = useState(false);

  const design = async () => {
    setBusy(true);
    try {
      const ownedStock = form.stock.map((s) =>
        createStock(s.materialId, s.length, s.quantity, true),
      );
      const next = await runPipeline(
        ruleBasedDesignEngine,
        {
          intent: form.intent,
          dimensions: { width: form.width, height: form.height, depth: form.depth },
          ownedStock,
        },
        { kerf: form.kerf },
      );
      setResult(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <h1 className="masthead__title">
            DIY <span>Design</span> Compiler
          </h1>
          <p className="masthead__tagline">
            寸法と手持ちの材料を、部材・木取り・組立手順へコンパイルする
          </p>
        </div>
        <div className="masthead__scale">
          <Scale span={STANDARD_SPAN} labels />
        </div>
      </header>

      <main className="layout">
        <div className="rail">
          <InputForm value={form} onChange={setForm} onSubmit={design} busy={busy} />
        </div>

        <div className="stage">
          {result === null ? (
            <div className="panel">
              <p className="empty">
                寸法を入れて「設計する」を押すと、作れる構造の候補が出ます。
              </p>
            </div>
          ) : (
            <>
              {result.notes.map((note) => (
                <div className="notice notice--info" key={note}>
                  <span className="notice__mark">i</span>
                  <span>{note}</span>
                </div>
              ))}
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panel__head">
                  <h2 className="panel__title">設計候補</h2>
                  <span className="eyebrow num">{result.designs.length} candidates</span>
                </div>
                <div className="panel__body">
                  {result.designs.length === 0 ? (
                    <p className="empty">条件に合う構造がありません。</p>
                  ) : (
                    <ul>
                      {result.designs.map((d) => (
                        <li key={d.candidate.id}>
                          {d.candidate.title} — 部材 {d.model.parts.length} 点 / 材料費 約
                          <span className="num"> {d.cutPlan.estimatedCost.toLocaleString()}</span> 円
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
