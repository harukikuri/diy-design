import { useRef, useState } from "react";
import type { AgentTraceEntry } from "./api/types.ts";
import type { DesignRun } from "./lib/runDesign.ts";
import { runDesign } from "./lib/runDesign.ts";
import type { FormState } from "./components/InputForm.tsx";
import { InputForm, initialForm } from "./components/InputForm.tsx";
import { AgentTrace } from "./components/AgentTrace.tsx";
import { CandidateGrid } from "./components/CandidateGrid.tsx";
import { DesignDetail } from "./components/DesignDetail.tsx";

export default function App() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [run, setRun] = useState<DesignRun | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveTrace, setLiveTrace] = useState<AgentTraceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selected = run?.designs.find((d) => d.candidate.id === selectedId) ?? null;
  const dialog = useRef<HTMLDialogElement>(null);

  const openForm = () => {
    dialog.current?.showModal();
    // showModal は最初の可視要素へフォーカスするが、それは段階ナビのボタン。
    // 入力できる場所へ移す。
    dialog.current
      ?.querySelector<HTMLElement>(".wizard__body input, .wizard__body select")
      ?.focus();
  };
  const closeForm = () => dialog.current?.close();

  const design = async () => {
    closeForm();
    setBusy(true);
    setError(null);
    setLiveTrace([]);
    setRun(null);
    try {
      const next = await runDesign(
        {
          intent: form.intent,
          dimensions: { width: form.width, height: form.height, depth: form.depth },
          stock: form.stock.map((s) => ({
            materialId: s.materialId,
            length: s.length,
            quantity: s.quantity,
          })),
          kerf: form.kerf,
        },
        // 足跡が届くたびに画面へ足す。20 秒以上の沈黙を作らない。
        (entry) => setLiveTrace((prev) => [...prev, entry]),
      );
      setRun(next);
      setSelectedId(next.designs[0]?.candidate.id ?? null);
    } catch (e) {
      setError((e as Error).message);
      setRun(null);
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
          <button
            type="button"
            className="btn btn--primary masthead__action"
            onClick={openForm}
            disabled={busy}
          >
            {busy ? "計算中…" : "設計する"}
          </button>
        </div>
      </header>

      <dialog className="sheet" ref={dialog} onClose={closeForm}>
        <div className="sheet__body">
          <InputForm value={form} onChange={setForm} onSubmit={design} busy={busy} />
          <button
            type="button"
            className="sheet__close"
            onClick={closeForm}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      </dialog>

      <main className="layout">
        <div className="stage">
          {error && (
            <div className="notice notice--error">
              <span className="notice__mark">!</span>
              <span>{error}</span>
            </div>
          )}

          {busy ? (
            <AgentTrace trace={liveTrace} live />
          ) : run === null ? null : (
            <>
              <AgentTrace
                trace={run.trace}
                engine={run.engine}
                model={run.model}
                evaluated={run.evaluated}
              />

              {run.notes.map((note) => (
                <div className="notice notice--info" key={note}>
                  <span className="notice__mark">i</span>
                  <span>{note}</span>
                </div>
              ))}

              <section className="section" style={{ marginTop: 12 }}>
                <div className="section-head">
                  <h2>設計候補</h2>
                  <span className="eyebrow num">{run.designs.length} candidates</span>
                </div>
                {run.designs.length === 0 ? (
                  <div className="panel">
                    <p className="empty">条件に合う構造がありません。寸法を見直してください。</p>
                  </div>
                ) : (
                  <CandidateGrid
                    designs={run.designs}
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
