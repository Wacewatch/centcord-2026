import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { initials, presenceColor } from "../lib/utils";
import UserBar from "./UserBar";
import { Search, UserPlus, Inbox } from "lucide-react";
import FriendsManager from "./FriendsManager";
import { toast } from "sonner";

export default function DMHome() {
  const navigate = useNavigate();
  const { dmId } = useParams();
  const [dms, setDms] = useState([]);
  const [friends, setFriends] = useState([]);
  const [tab, setTab] = useState("dms");

  const loadDms = async () => {
    try { const { data } = await api.get("/dms"); setDms(data); } catch (_) {}
  };
  const loadFriends = async () => {
    try { const { data } = await api.get("/friends"); setFriends(data); } catch (_) {}
  };

  useEffect(() => { loadDms(); loadFriends(); }, []);

  const startDM = async (uid) => {
    try {
      const { data } = await api.post("/dms", { user_id: uid });
      await loadDms();
      navigate(`/app/me/${data.dm_id}`);
    } catch (e) { toast.error("Failed to open DM"); }
  };

  return (
    <>
      <aside className="w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0">
        <div className="px-4 h-12 border-b border-cc-border flex items-center font-display font-extrabold uppercase text-sm tracking-tighter">DIRECT MESSAGES</div>
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 bg-cc-base border border-cc-border px-2 py-1.5">
            <Search className="w-3 h-3 text-cc-muted" />
            <input data-testid="dm-search" placeholder="Find or start" className="flex-1 bg-transparent outline-none text-xs" />
          </div>
        </div>
        <div className="px-2 pb-2 space-y-1 overflow-y-auto">
          {dms.map((d) => (
            <button
              key={d.dm_id}
              onClick={() => navigate(`/app/me/${d.dm_id}`)}
              data-testid={`dm-item-${d.dm_id}`}
              className="w-full flex items-center gap-3 px-2 py-2 hover:bg-cc-surface2 text-left transition-colors"
            >
              <div className="relative">
                <div className="w-8 h-8 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-xs">
                  {d.other?.avatar_url ? <img src={d.other.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(d.other?.display_name || "?")}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 cc-status-dot ${presenceColor(d.other?.status)}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{d.other?.display_name || "Unknown"}</div>
                <div className="text-[10px] text-cc-muted uppercase tracking-widest truncate">{d.other?.custom_status || "—"}</div>
              </div>
            </button>
          ))}
          {dms.length === 0 && <div className="text-cc-muted text-xs text-center py-8 uppercase tracking-widest">No DMs yet</div>}
        </div>
        <div className="mt-auto"><UserBar /></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-cc-border px-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Inbox className="w-4 h-4 text-cc-muted" />
            <span className="font-display font-bold uppercase tracking-wider text-sm">Friends</span>
          </div>
          <div className="cc-divider !w-px h-6" />
          <button onClick={() => setTab("dms")} data-testid="tab-dms" className={`text-xs uppercase tracking-widest font-bold px-2 py-1 ${tab === "dms" ? "text-cc-text" : "text-cc-muted hover:text-cc-text"}`}>Online</button>
          <button onClick={() => setTab("all")} data-testid="tab-all" className={`text-xs uppercase tracking-widest font-bold px-2 py-1 ${tab === "all" ? "text-cc-text" : "text-cc-muted hover:text-cc-text"}`}>All</button>
          <button onClick={() => setTab("pending")} data-testid="tab-pending" className={`text-xs uppercase tracking-widest font-bold px-2 py-1 ${tab === "pending" ? "text-cc-text" : "text-cc-muted hover:text-cc-text"}`}>Pending</button>
          <button onClick={() => setTab("add")} data-testid="tab-add" className={`text-xs uppercase tracking-widest font-bold px-3 py-1 bg-cc-accent text-white ml-auto`}>
            <UserPlus className="w-3 h-3 inline mr-1" /> Add friend
          </button>
        </header>
        <FriendsManager tab={tab} friends={friends} reload={loadFriends} onDM={startDM} />
      </main>
    </>
  );
}
