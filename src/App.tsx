import { useEffect, useState } from "react";
import type { AgentTraceEntry, DesignRequestBody } from "./api/types.ts";
import type { DesignRun } from "./lib/runDesign.ts";
import { expandResponse, runDesign } from "./lib/runDesign.ts";
import type { SavedRun } from "./lib/history.ts";
import { deleteRun, loadRuns, saveRun } from "./lib/history.ts";
import type { FormState } from "./components/InputForm.tsx";
import { InputForm, initialForm } from "./components/InputForm.tsx";
import { AgentTrace } from "./components/AgentTrace.tsx";
import { CandidateGrid } from "./components/CandidateGrid.tsx";
import { DesignDetail } from "./components/DesignDetail.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

const toRequest = (form: FormState): DesignRequestBody => ({
  intent: form.intent,
  dimensions: { width: form.width, height: form.height, depth: form.depth },
  stock: form.stock.map((s) => ({
    materialId: s.materialId,
    length: s.length,
    quantity: s.quantity,
  })),
  kerf: form.kerf,
});

const toForm = (request: DesignRequestBody): FormState => ({
  intent: request.intent,
  width: request.dimensions.width,
  height: request.dimensions.height,
  depth: request.dimensions.depth,
  stock: request.stock.map((s, i) => ({ key: `s${i}`, ...s })),
  kerf: request.kerf,
});

export default function App() {
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [run, setRun] = useState<DesignRun | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [liveTrace, setLiveTrace] = useState<AgentTraceEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setRuns(loadRuns()), []);

  const selected = run?.designs.find((d) => d.candidate.id === selectedId) ?? null;
  const drafting = run === null && !busy;

  const startNew = () => {
    setRun(null);
    setActiveId(null);
    setSelectedId(null);
    setError(null);
    setLiveTrace([]);
  };

  const open = (id: string) => {
    const saved = runs.find((r) => r.id === id);
    if (!saved) return;
    const expanded = expandResponse(saved.request, saved.response);
    setActiveId(id);
    setForm(toForm(saved.request));
    setRun(expanded);
    setSelectedId(expanded.designs[0]?.candidate.id ?? null);
    setError(null);
  };

  const remove = (id: string) => {
    setRuns(deleteRun(id));
    if (id === activeId) startNew();
  };

  const design = async () => {
    const request = toRequest(form);
    setBusy(true);
    setError(null);
    setLiveTrace([]);
    setRun(null);
    setActiveId(null);
    try {
      const { run: next, response } = await runDesign(request, (entry) =>
        setLiveTrace((prev) => [...prev, entry]),
      );
      const saved = saveRun(request, response);
      setRuns(loadRuns());
      setActiveId(saved.id);
      setRun(next);
      setSelectedId(next.designs[0]?.candidate.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <Sidebar
        runs={runs}
        activeId={activeId}
        drafting={drafting}
        busy={busy}
        onCreate={startNew}
        onSelect={open}
        onDelete={remove}
      />

      <main className="main">
        {error && (
          <div className="notice notice--error">
            <span className="notice__mark">!</span>
            <span>{error}</span>
          </div>
        )}

        {busy ? (
          <div className="main__inner">
            <AgentTrace trace={liveTrace} live />
          </div>
        ) : run === null ? (
          <div className="main__compose">
            <InputForm value={form} onChange={setForm} onSubmit={design} busy={busy} />
          </div>
        ) : (
          <div className="main__inner">
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
          </div>
        )}
      </main>
    </div>
  );
}
