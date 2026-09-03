/**
 * スケール — この UI の署名要素。
 *
 * 日本の木材の定尺 1820mm を既定の基準長にして、入力した寸法・木取り・完成寸法を
 * すべて同じ目盛りの上で読ませる。数字だけでは掴めない「材1本に対してどれくらいか」
 * を、入力の時点から見えるようにするための部品。
 */

export const STANDARD_SPAN = 1820;

interface ScaleProps {
  /** 目盛り全体が表す長さ (mm) */
  span?: number;
  /** 現在値 (mm)。渡すと塗りと数値を表示する。 */
  value?: number;
  /** 主目盛の間隔 (mm) */
  major?: number;
  /** 補助目盛の間隔 (mm) */
  minor?: number;
  /** 主目盛に数値を振る */
  labels?: boolean;
}

export function Scale({
  span = STANDARD_SPAN,
  value,
  major = 500,
  minor = 100,
  labels = false,
}: ScaleProps) {
  const ticks: { at: number; major: boolean }[] = [];
  for (let mm = 0; mm <= span; mm += minor) {
    ticks.push({ at: mm, major: mm % major === 0 });
  }

  const ratio = value === undefined ? 0 : value / span;
  const over = ratio > 1;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <div
      className={`scale${over ? " scale--over" : ""}`}
      role="img"
      aria-label={
        value === undefined
          ? `${span}mm の目盛り`
          : `${span}mm に対して ${Math.round(value)}mm`
      }
    >
      {value !== undefined && (
        <>
          <div className="scale__fill" style={{ width: `${clamped * 100}%` }} />
          <div className="scale__value" style={{ left: `${clamped * 100}%` }}>
            {Math.round(value)}
          </div>
        </>
      )}
      {ticks.map((t) => (
        <div
          key={t.at}
          className={`scale__tick scale__tick--${t.major ? "major" : "minor"}`}
          style={{ left: `${(t.at / span) * 100}%` }}
        />
      ))}
      {labels &&
        ticks
          .filter((t) => t.major && t.at > 0)
          .map((t) => (
            <div key={`l${t.at}`} className="scale__label" style={{ left: `${(t.at / span) * 100}%` }}>
              {t.at}
            </div>
          ))}
    </div>
  );
}
