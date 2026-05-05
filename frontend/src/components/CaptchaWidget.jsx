import React, { useState, useMemo } from "react";
import { ShieldCheck } from "lucide-react";

export default function CaptchaWidget({ onValid }) {
  const [seed, setSeed] = useState(0);
  const challenge = useMemo(() => {
    void seed;
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    const op = Math.random() > 0.5 ? "+" : "-";
    const ans = op === "+" ? a + b : a - b;
    return { a, b, op, ans };
  }, [seed]);
  const [val, setVal] = useState("");
  const [solved, setSolved] = useState(false);

  const check = (v) => {
    setVal(v);
    if (parseInt(v) === challenge.ans) {
      setSolved(true);
      onValid && onValid(true);
    } else {
      setSolved(false);
      onValid && onValid(false);
    }
  };

  return (
    <div className="border border-cc-border bg-cc-surface1 px-3 py-2.5 flex items-center gap-3" data-testid="captcha-widget">
      <ShieldCheck className={`w-4 h-4 ${solved ? "text-cc-success" : "text-cc-muted"}`} />
      <span className="text-xs text-cc-subtext font-jetbrains tabular-nums">{challenge.a} {challenge.op} {challenge.b} =</span>
      <input data-testid="captcha-input" value={val} onChange={(e) => check(e.target.value)} type="number" placeholder="?" className="w-16 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-2 py-1 text-xs font-jetbrains tabular-nums" />
      <button type="button" onClick={() => { setSeed(s => s + 1); setVal(""); setSolved(false); onValid && onValid(false); }} className="text-[10px] uppercase tracking-widest text-cc-muted hover:text-cc-text ml-auto">Recharger</button>
    </div>
  );
}
