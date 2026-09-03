import { useCallback, useEffect, useRef, useState } from "react";
import { requestHealth, requestRender } from "../api/client.ts";
import { describeDesign } from "../lib/describeDesign.ts";
import type { CompiledDesign } from "../core/pipeline.ts";
import { Viewer3D } from "./Viewer3D.tsx";

/**
 * 完成イメージ (§6.2)。
 *
 * 左が設計そのままの 3D、右がそれを下敷きに生成した完成写真。
 * 文章だけから描かせると段数や比率がずれるため、必ず 3D の
 * スナップショットを参照画像として渡す。
 */

interface Props {
  design: CompiledDesign;
}

export function CompletionImage({ design }: Props) {
  const capture = useRef<(() => string) | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    requestHealth()
      .then((h) => setAiEnabled(h.ai))
      .catch(() => setAiEnabled(false));
  }, []);

  // 候補を切り替えたら前の画像は捨てる
  useEffect(() => {
    setImage(null);
    setError(null);
  }, [design.candidate.id]);

  const onCaptureReady = useCallback((fn: () => string) => {
    capture.current = fn;
  }, []);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestRender({
        description: describeDesign(design),
        referencePng: capture.current?.() ?? undefined,
      });
      setImage(result.image);
      setModel(result.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="render">
      <div className="render__pane">
        <div className="render__head">
          <h3>設計の形状</h3>
          <span className="eyebrow">reference</span>
        </div>
        <div className="render__body">
          <Viewer3D model={design.model} onCaptureReady={onCaptureReady} />
        </div>
        <div className="render__foot">
          <p className="field__hint">
            この 3D をそのまま参照画像として渡すので、段数と比率は設計と一致します。
          </p>
        </div>
      </div>

      <div className="render__pane">
        <div className="render__head">
          <h3>完成イメージ</h3>
          <span className="eyebrow">{model ?? "nano banana"}</span>
        </div>
        <div className="render__body">
          {image ? (
            <img src={image} alt={`${design.candidate.title}の完成イメージ`} />
          ) : (
            <p className="render__placeholder">
              {busy
                ? "生成しています…"
                : aiEnabled === false
                  ? "完成イメージの生成には GEMINI_API_KEY が必要です。"
                  : "3D の形状をもとに、部屋に置いた状態の写真を生成します。"}
            </p>
          )}
        </div>
        <div className="render__foot">
          <button
            type="button"
            className="btn"
            onClick={generate}
            disabled={busy || aiEnabled === false}
          >
            {busy ? "生成中…" : image ? "作り直す" : "完成イメージを生成"}
          </button>
          {error && (
            <div className="notice notice--error" style={{ marginTop: 10 }}>
              <span className="notice__mark">!</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
