import React, { useEffect, useState } from "react";
import api from "../lib/api";
import ModalShell from "./modals/ModalShell";
import { initials, formatDate, formatTime } from "../lib/utils";
import { Pin } from "lucide-react";

export default function PinModal({ channelId, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try { const { data } = await api.get(`/channels/${channelId}/pins`); if (alive) setItems(data); }
      catch (_) {}
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [channelId]);

  return (
    <ModalShell title="Messages épinglés" onClose={onClose} testId="pin-modal">
      {loading ? (
        <div className="py-10 flex justify-center"><div className="cc-spinner" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-cc-muted text-xs uppercase tracking-widest">
          <Pin className="w-6 h-6 mx-auto mb-2 opacity-50" />Aucun message épinglé
        </div>
      ) : (
        <ul className="space-y-px bg-cc-border max-h-96 overflow-y-auto">
          {items.map((m) => (
            <li key={m.message_id} className="bg-cc-surface1 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px] shrink-0">
                  {m.author?.avatar_url ? <img src={m.author.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(m.author?.display_name || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold text-cc-accent text-sm">{m.author?.display_name || "?"}</span>
                    <span className="text-[10px] text-cc-muted">{formatDate(m.created_at)} · {formatTime(m.created_at)}</span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
