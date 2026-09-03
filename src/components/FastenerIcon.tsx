import type { FastenerType } from "../core/domain.ts";

/**
 * 金物の記号。IKEA の説明書のように、言語を読まなくても
 * 「何を何個使うか」が分かるようにするための最小限の絵 (§15.1)。
 */
export function FastenerIcon({ type }: { type: FastenerType }) {
  const common = {
    width: 34,
    height: 34,
    viewBox: "0 0 34 34",
    fill: "none",
    stroke: "#16191c",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "screw") {
    return (
      <svg {...common}>
        <path d="M11 7h12" />
        <path d="M14 7v3.5" />
        <path d="M20 7v3.5" />
        <path d="M13 10.5h8l-.6 12.5L17 28l-3.4-5z" />
        <path d="M13.6 14h6.8M13.8 17h6.4M14 20h6" />
      </svg>
    );
  }
  if (type === "bolt") {
    return (
      <svg {...common}>
        <path d="M13 6.5h8l3 4.5-3 4.5h-8l-3-4.5z" />
        <path d="M15.5 15.5h3V28h-3z" />
        <path d="M15.5 19h3M15.5 22h3M15.5 25h3" />
      </svg>
    );
  }
  if (type === "bracket") {
    return (
      <svg {...common}>
        <path d="M9 7h5v20h16v5H9z" />
        <circle cx="11.5" cy="10.5" r="1.2" />
        <circle cx="11.5" cy="23" r="1.2" />
        <circle cx="26" cy="29.5" r="1.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M14 5h6v6l3 4v14h-12V15l3-4z" />
      <path d="M14 20h6" />
    </svg>
  );
}
