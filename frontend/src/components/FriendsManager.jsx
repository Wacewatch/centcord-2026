import React, { useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { initials, presenceColor } from "../lib/utils";
import { MessageCircle, X, Check, UserPlus } from "lucide-react";

export default function FriendsManager({ tab, friends, reload, onDM }) {
  const [target, setTarget] = useState("");
  const filtered = friends.filter((f) => {
    if (tab === "pending") return f.status === "pending";
    if (tab === "dms") return f.status === "accepted" && f.user.status === "online";
    if (tab === "all") return f.status === "accepted";
    return true;
  });

  const sendRequest = async (e) => {
    e?.preventDefault();
    if (!target.trim()) return;
    try {
      await api.post("/friends/requests", { target: target.trim() });
      toast.success("Demande d'ami envoyée");
      setTarget(""); reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec de l'envoi"); }
  };

  const respond = async (id, action) => {
    try { await api.patch(`/friends/${id}?action=${action}`); reload(); }
    catch (_) { toast.error("Échec"); }
  };

  const remove = async (id) => {
    try { await api.delete(`/friends/${id}`); reload(); }
    catch (_) { toast.error("Échec"); }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-cc-surface2">
      {tab === "add" ? (
        <form onSubmit={sendRequest} className="max-w-2xl">
          <h3 className="font-display font-extrabold text-3xl uppercase tracking-tighter mb-2">Ajouter un ami</h3>
          <p className="text-cc-subtext text-sm mb-6">Tapez son e-mail, son user_id ou son pseudonyme.</p>
          <div className="flex gap-3">
            <input data-testid="friend-add-input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="vector@centcord.app" className="flex-1 bg-cc-surface1 border border-cc-border focus:border-cc-accent outline-none px-4 py-3 font-jetbrains" />
            <button data-testid="friend-add-submit" className="bg-cc-accent text-white font-bold uppercase tracking-wide px-6 cc-brutal-shadow cc-brutal-press">Envoyer</button>
          </div>
        </form>
      ) : (
        <div className="max-w-3xl">
          <div className="text-xs uppercase tracking-widest text-cc-muted mb-3">{filtered.length} {tab === "pending" ? "en attente" : tab === "dms" ? "en ligne" : "amis"}</div>
          <ul className="space-y-px bg-cc-border">
            {filtered.map((f) => (
              <li key={f.friend_id} className="bg-cc-surface2 px-4 py-3 flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-xs">
                    {f.user.avatar_url ? <img src={f.user.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(f.user.display_name)}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 cc-status-dot ${presenceColor(f.user.status)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{f.user.display_name}</div>
                  <div className="text-[10px] text-cc-muted uppercase tracking-widest">{f.status === "pending" ? (f.initiator === f.user.user_id ? "Entrant" : "Sortant") : f.user.email}</div>
                </div>
                {f.status === "accepted" && (
                  <button onClick={() => onDM(f.user.user_id)} data-testid={`friend-dm-${f.friend_id}`} className="p-2 hover:bg-cc-base text-cc-subtext hover:text-cc-text" title="Envoyer un message">
                    <MessageCircle className="w-4 h-4" />
                  </button>
                )}
                {f.status === "pending" && f.initiator === f.user.user_id && (
                  <>
                    <button onClick={() => respond(f.friend_id, "accept")} data-testid={`friend-accept-${f.friend_id}`} className="p-2 hover:bg-cc-base text-cc-success" title="Accepter"><Check className="w-4 h-4" /></button>
                    <button onClick={() => respond(f.friend_id, "reject")} data-testid={`friend-reject-${f.friend_id}`} className="p-2 hover:bg-cc-base text-cc-danger" title="Refuser"><X className="w-4 h-4" /></button>
                  </>
                )}
                {f.status === "accepted" && (
                  <button onClick={() => remove(f.friend_id)} data-testid={`friend-remove-${f.friend_id}`} className="p-2 hover:bg-cc-base text-cc-muted hover:text-cc-danger" title="Retirer"><X className="w-4 h-4" /></button>
                )}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="bg-cc-surface2 p-12 text-center text-cc-muted text-xs uppercase tracking-widest">
                Rien à afficher.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
