import React from "react";
import { initials, presenceColor } from "../lib/utils";
import api from "../lib/api";
import { toast } from "sonner";
import { UserMinus, ShieldOff } from "lucide-react";

export default function MembersSidebar({ members, server, reload }) {
  const groupBy = { Online: [], Offline: [] };
  const owner = server?.owner_id;
  for (const m of members) {
    if (m.user.status && m.user.status !== "offline") groupBy.Online.push(m);
    else groupBy.Offline.push(m);
  }
  const canKick = (server?.my_perms || 0) & (1 << 5);
  const kick = async (uid) => {
    if (!window.confirm("Expulser ce membre ?")) return;
    try { await api.delete(`/servers/${server.server_id}/members/${uid}`); reload(); toast.success("Membre expulsé"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };
  const ban = async (uid) => {
    if (!window.confirm("Bannir ce membre ?")) return;
    try { await api.post(`/servers/${server.server_id}/bans/${uid}`); reload(); toast.success("Membre banni"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  return (
    <aside className="w-60 bg-cc-surface1 border-l border-cc-border flex flex-col shrink-0 hidden xl:flex">
      <div className="px-4 py-3 text-[10px] uppercase tracking-[0.3em] font-bold text-cc-muted border-b border-cc-border">
        Membres — {members.length}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(groupBy).map(([label, list]) => list.length > 0 && (
          <div key={label} className="mb-3">
            <div className="px-4 text-[10px] uppercase tracking-[0.3em] font-bold text-cc-muted mb-1">{label === "Online" ? "En ligne" : "Hors ligne"} — {list.length}</div>
            {list.map((m) => (
              <div key={m.user_id} className="group px-4 py-1.5 flex items-center gap-2 hover:bg-cc-surface2 transition-colors">
                <div className="relative">
                  <div className="w-7 h-7 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px]">
                    {m.user.avatar_url ? <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(m.user.display_name)}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 cc-status-dot ${presenceColor(m.user.status)}`} />
                </div>
                <div className="flex-1 min-w-0 text-sm truncate" data-testid={`member-${m.user_id}`}>
                  {m.nickname || m.user.display_name}
                  {owner === m.user_id && <span className="ml-2 text-[8px] uppercase tracking-widest text-cc-accent">Propriétaire</span>}
                </div>
                {canKick && owner !== m.user_id && (
                  <div className="opacity-0 group-hover:opacity-100 flex">
                    <button onClick={() => kick(m.user_id)} className="p-1 text-cc-muted hover:text-cc-danger" title="Expulser"><UserMinus className="w-3 h-3" /></button>
                    <button onClick={() => ban(m.user_id)} className="p-1 text-cc-muted hover:text-cc-danger" title="Bannir"><ShieldOff className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
