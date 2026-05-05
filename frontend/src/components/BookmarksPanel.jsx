import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { initials, formatDate, formatTime } from "../lib/utils";
import { Bookmark, X } from "lucide-react";
import { toast } from "sonner";

export default function BookmarksPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/bookmarks"); setItems(data); }
    catch (_) {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (mid) => {
    try { await api.delete(`/bookmarks/${mid}`); setItems(items.filter(i => i.message.message_id !== mid)); toast.success("Retiré"); }
    catch (_) { toast.error("Échec"); }
  };

  if (loading) return <div className="cc-spinner mt-8" />;

  return (
    <>
      <h1 className="font-display text-4xl font-extrabold tracking-tighter uppercase mb-8">Messages sauvegardés</h1>
      {items.length === 0 ? (
        <p className="text-cc-subtext text-sm">Aucun message sauvegardé. Sur un message, cliquez sur l'icône <Bookmark className="inline w-3 h-3" /> pour le garder ici.</p>
      ) : (
        <ul className="space-y-px bg-cc-border">
          {items.map((b) => (
            <li key={b.message.message_id} className="bg-cc-surface1 px-4 py-3 group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px] shrink-0">
                  {b.message.author?.avatar_url ? <img src={b.message.author.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(b.message.author?.display_name || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display font-bold text-cc-accent text-sm">{b.message.author?.display_name || "Inconnu"}</span>
                    <span className="text-[10px] text-cc-muted">{formatDate(b.message.created_at)} · {formatTime(b.message.created_at)}</span>
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words">{b.message.content}</p>
                </div>
                <button onClick={() => remove(b.message.message_id)} className="opacity-0 group-hover:opacity-100 text-cc-muted hover:text-cc-danger" title="Retirer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
