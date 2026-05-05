import React, { useState, useEffect } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import { BarChart3, Check } from "lucide-react";
import { toast } from "sonner";

export default function PollCard({ poll: initialPoll }) {
  const { user } = useAuth();
  const ws = useWS();
  const [poll, setPoll] = useState(initialPoll);

  useEffect(() => { setPoll(initialPoll); }, [initialPoll]);
  useEffect(() => {
    if (!ws || !poll?.poll_id) return;
    const off = ws.subscribe("poll.update", (d) => {
      if (d.poll_id === poll.poll_id) setPoll((p) => ({ ...p, options: d.options }));
    });
    const offEnd = ws.subscribe("poll.end", (d) => {
      if (d.poll_id === poll.poll_id) setPoll((p) => ({ ...p, ended: true }));
    });
    return () => { off(); offEnd(); };
  }, [ws, poll?.poll_id]);

  if (!poll) return null;
  const total = poll.options.reduce((acc, o) => acc + (o.votes?.length || 0), 0);
  const myVotes = new Set();
  poll.options.forEach(o => { if (o.votes?.includes(user?.user_id)) myVotes.add(o.option_id); });
  const expired = poll.expires_at && new Date(poll.expires_at) < new Date();
  const closed = poll.ended || expired;

  const vote = async (optId) => {
    if (closed) return;
    try { const { data } = await api.post(`/polls/${poll.poll_id}/vote`, null, { params: { option_id: optId } }); setPoll((p) => ({ ...p, options: data.options })); }
    catch (e) { toast.error(e?.response?.data?.detail || "Vote impossible"); }
  };

  const closePoll = async () => {
    if (!window.confirm("Clôturer ce sondage ?")) return;
    try {
      await api.post(`/polls/${poll.poll_id}/end`);
      setPoll((p) => ({ ...p, ended: true }));
      toast.success("Sondage clôturé");
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const isAuthor = poll.author_id === user?.user_id;

  return (
    <div className="mt-2 border border-cc-border bg-cc-surface1 p-4 max-w-md">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-cc-accent" />
        <span className="text-[10px] uppercase tracking-widest font-bold text-cc-muted">Sondage{poll.multi ? " · Multi" : ""}{closed ? " · Fermé" : ""}</span>
      </div>
      <div className="font-display font-bold text-base mb-3">{poll.question}</div>
      <ul className="space-y-2">
        {poll.options.map((o) => {
          const count = o.votes?.length || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const voted = myVotes.has(o.option_id);
          return (
            <li key={o.option_id}>
              <button
                onClick={() => vote(o.option_id)}
                disabled={closed}
                data-testid={`poll-vote-${o.option_id}`}
                className={`w-full relative border ${voted ? "border-cc-accent" : "border-cc-border"} bg-cc-surface2 hover:bg-cc-base text-left transition-colors disabled:cursor-not-allowed group overflow-hidden`}
              >
                <div className="absolute inset-y-0 left-0 bg-cc-accent/20 transition-all" style={{ width: `${pct}%` }} />
                <div className="relative px-3 py-2 flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 border ${voted ? "bg-cc-accent border-cc-accent" : "border-cc-muted"} flex items-center justify-center shrink-0`}>
                    {voted && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <span className="text-sm flex-1">{o.text}</span>
                  <span className="text-xs text-cc-muted font-jetbrains tabular-nums">{count} · {pct}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="text-[10px] text-cc-muted uppercase tracking-widest mt-3 flex items-center justify-between gap-3">
        <span>{total} vote{total !== 1 ? "s" : ""}{poll.expires_at && !closed ? ` · Expire ${new Date(poll.expires_at).toLocaleString()}` : ""}</span>
        {!closed && isAuthor && (
          <button onClick={closePoll} data-testid={`poll-close-${poll.poll_id}`} className="text-cc-accent hover:text-cc-text font-bold">Clôturer</button>
        )}
      </div>
    </div>
  );
}
