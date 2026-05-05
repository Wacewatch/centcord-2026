import React, { useState } from "react";
import api from "../lib/api";
import ModalShell from "./modals/ModalShell";
import { Plus, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export default function PollComposer({ channelId, onClose, onCreated }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);

  const update = (i, v) => setOptions(options.map((o, k) => (k === i ? v : o)));
  const add = () => options.length < 10 && setOptions([...options, ""]);
  const remove = (i) => options.length > 2 && setOptions(options.filter((_, k) => k !== i));

  const submit = async () => {
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (question.trim().length < 2 || opts.length < 2) { toast.error("Question + 2 options minimum"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/polls", { channel_id: channelId, question: question.trim(), options: opts, multi, expires_in_minutes: duration });
      toast.success("Sondage publié");
      onCreated && onCreated(data);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
    finally { setLoading(false); }
  };

  return (
    <ModalShell title="Créer un sondage" onClose={onClose} testId="poll-composer">
      <div className="space-y-4">
        <div>
          <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Question</label>
          <input data-testid="poll-question" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} placeholder="Quelle est ta préférence ?" className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
        </div>
        <div>
          <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Options</label>
          <ul className="mt-2 space-y-2">
            {options.map((o, i) => (
              <li key={i} className="flex items-center gap-2">
                <input data-testid={`poll-option-${i}`} value={o} onChange={(e) => update(i, e.target.value)} maxLength={120} placeholder={`Option ${i + 1}`} className="flex-1 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2" />
                {options.length > 2 && <button onClick={() => remove(i)} className="p-2 text-cc-muted hover:text-cc-danger"><X className="w-4 h-4" /></button>}
              </li>
            ))}
          </ul>
          {options.length < 10 && (
            <button onClick={add} data-testid="poll-add-option" className="mt-2 text-xs uppercase tracking-widest text-cc-accent flex items-center gap-1 hover:text-cc-text"><Plus className="w-3 h-3" /> Ajouter une option</button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-cc-accent w-4 h-4" data-testid="poll-multi" />
            <span className="text-sm">Choix multiple</span>
          </label>
          <div>
            <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Durée (minutes)</label>
            <input type="number" min="0" max="10080" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 0)} className="mt-1 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 text-sm" />
            <p className="text-[10px] text-cc-muted mt-1">0 = sans limite · max 7 jours</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-cc-border">
          <button onClick={onClose} className="px-4 py-2 text-cc-subtext hover:text-cc-text uppercase tracking-widest text-xs font-bold">Annuler</button>
          <button onClick={submit} disabled={loading} data-testid="poll-submit" className="bg-cc-accent text-white font-bold uppercase tracking-wide px-5 py-2 cc-brutal-shadow cc-brutal-press disabled:opacity-50 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> {loading ? "Publication..." : "Publier le sondage"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
