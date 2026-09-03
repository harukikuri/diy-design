import { useState } from "react";
import { ruleBasedDesignEngine } from "./core/designEngine.ts";
import { createStock } from "./core/materials.ts";
import type { PipelineResult } from "./core/pipeline.ts";
import { runPipeline } from "./core/pipeline.ts";
import type { FormState } from "./components/InputForm.tsx";
import { InputForm, initialForm } from "./components/InputForm.tsx";
import { CandidateGrid } from "./components/CandidateGrid.tsx";
import { DesignDetail } from "./components/DesignDetail.tsx";
import { Scale, STANDARD_SPAN } from "./components/Scale.tsx";

export default function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected =
    result?.designs.find((d) => d.candidate.id === selectedId) ?? null;

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
      setSelectedId(next.designs[0]?.candidate.id ?? null);
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
              <section className="section" style={{ marginTop: 12 }}>
                <div className="section-head">
                  <h2>設計候補</h2>
                  <span className="eyebrow num">{result.designs.length} candidates</span>
                </div>
                {result.designs.length === 0 ? (
                  <div className="panel">
                    <p className="empty">条件に合う構造がありません。寸法を見直してください。</p>
                  </div>
                ) : (
                  <CandidateGrid
                    designs={result.designs}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                )}
              </section>

              {selected && (
                <section className="section" style={{ marginTop: 28 }}>
                  <div className="section-head">
                    <h2>{selected.candidate.title}</h2>
                  </div>
                  <DesignDetail design={selected} />
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
