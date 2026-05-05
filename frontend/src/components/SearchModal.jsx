import React, { useEffect, useRef, useState } from "react";
import api from "../lib/api";
import ModalShell from "./modals/ModalShell";
import { initials, formatDate, formatTime } from "../lib/utils";
import { Search, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SearchModal({ serverId, onClose }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const t = useRef(null);

  useEffect(() => {
    if (t.current) clearTimeout(t.current);
    if (!q.trim()) { setItems([]); return; }
    t.current = setTimeout(async () => {
      setLoading(true);
      try { const { data } = await api.get(`/servers/${serverId}/search`, { params: { q } }); setItems(data || []); }
      catch (_) {}
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t.current);
  }, [q, serverId]);

  const goTo = (m) => {
    onClose();
    navigate(`/app/servers/${serverId}/channels/${m.channel_id}`);
  };

  return (
    <ModalShell title="Recherche" onClose={onClose} testId="search-modal" wide>
      <div className="flex items-center gap-3 border-b border-cc-border focus-within:border-cc-accent transition-colors">
        <Search className="w-4 h-4 text-cc-muted" />
        <input autoFocus data-testid="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tapez pour chercher des messages..." className="flex-1 bg-transparent py-3 outline-none" />
        {loading && <div className="cc-spinner !w-3.5 !h-3.5" />}
      </div>
      <div className="mt-4 max-h-[55vh] overflow-y-auto space-y-px bg-cc-border">
        {items.length === 0 && q && !loading && (
          <div className="bg-cc-surface1 px-4 py-8 text-center text-cc-muted text-xs uppercase tracking-widest">Aucun résultat</div>
        )}
        {items.map((m) => (
          <button key={m.message_id} onClick={() => goTo(m)} className="w-full bg-cc-surface1 hover:bg-cc-surface2 px-4 py-3 text-left group">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px] shrink-0">
                {m.author?.avatar_url ? <img src={m.author.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(m.author?.display_name || "?")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-display font-bold text-cc-accent text-sm">{m.author?.display_name || "?"}</span>
                  <span className="text-[10px] text-cc-muted">{formatDate(m.created_at)} · {formatTime(m.created_at)}</span>
                </div>
                <p className="text-sm mt-1 line-clamp-2 break-words">{m.content}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-cc-muted opacity-0 group-hover:opacity-100" />
            </div>
          </button>
        ))}
      </div>
    </ModalShell>
  );
}
