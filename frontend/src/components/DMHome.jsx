import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { initials, presenceColor, cn } from "../lib/utils";
import { useMobile } from "../lib/mobile";
import UserBar from "./UserBar";
import { Search, UserPlus, Inbox, Bookmark, Menu, X as XIcon } from "lucide-react";
import FriendsManager from "./FriendsManager";
import { toast } from "sonner";

export default function DMHome() {
  const navigate = useNavigate();
  const { dmId } = useParams();
  const { isMobile, drawerOpen, toggleDrawer, closeDrawer } = useMobile();
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
      if (isMobile) closeDrawer();
    } catch (e) { toast.error("Failed to open DM"); }
  };

  const goDM = (id) => { navigate(`/app/me/${id}`); if (isMobile) closeDrawer(); };

  return (
    <>
      <aside
        className={cn(
          "w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0 transition-transform duration-300 ease-out",
          isMobile ? "fixed inset-y-0 left-20 z-40 h-[100dvh]" : "",
          isMobile && !drawerOpen ? "-translate-x-[calc(100%+5rem)]" : "translate-x-0"
        )}
      >
        <div className="px-4 h-12 border-b border-cc-border flex items-center font-display font-extrabold uppercase text-sm tracking-tighter">MESSAGES PRIVÉS</div>
        <div className="px-3 py-3">
          <div className="flex items-center gap-2 bg-cc-base border border-cc-border px-2 py-1.5">
            <Search className="w-3 h-3 text-cc-muted" />
            <input data-testid="dm-search" placeholder="Rechercher ou démarrer" className="flex-1 bg-transparent outline-none text-xs" />
          </div>
        </div>
        <div className="px-2 pb-2">
          <button onClick={() => { navigate("/app/me/bookmarks"); if (isMobile) closeDrawer(); }} data-testid="dm-bookmarks-link" className="w-full flex items-center gap-3 px-2 py-2 hover:bg-cc-surface2 text-left transition-colors text-cc-subtext hover:text-cc-text">
            <Bookmark className="w-4 h-4" />
            <span className="text-sm">Messages sauvegardés</span>
          </button>
        </div>
        <div className="px-2 pb-2 space-y-1 overflow-y-auto flex-1">
          {dms.map((d) => (
            <button
              key={d.dm_id}
              onClick={() => goDM(d.dm_id)}
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
                <div className="text-sm truncate">{d.other?.display_name || "Inconnu"}</div>
                <div className="text-[10px] text-cc-muted uppercase tracking-widest truncate">{d.other?.custom_status || "—"}</div>
              </div>
            </button>
          ))}
          {dms.length === 0 && <div className="text-cc-muted text-xs text-center py-8 uppercase tracking-widest">Aucun MP pour l'instant</div>}
        </div>
        <div className="mt-auto"><UserBar /></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-cc-border px-2 sm:px-4 flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          {isMobile && (
            <button onClick={toggleDrawer} aria-label="Menu" className="p-2 -ml-1 text-cc-subtext hover:text-cc-text shrink-0">
              {drawerOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <Inbox className="w-4 h-4 text-cc-muted" />
            <span className="font-display font-bold uppercase tracking-wider text-sm">Amis</span>
          </div>
          <div className="cc-divider !w-px h-6 hidden sm:block" />
          <button onClick={() => setTab("dms")} data-testid="tab-dms" className={`text-xs uppercase tracking-widest font-bold px-2 py-1 shrink-0 ${tab === "dms" ? "text-cc-text" : "text-cc-muted hover:text-cc-text"}`}>En ligne</button>
          <button onClick={() => setTab("all")} data-testid="tab-all" className={`text-xs uppercase tracking-widest font-bold px-2 py-1 shrink-0 ${tab === "all" ? "text-cc-text" : "text-cc-muted hover:text-cc-text"}`}>Tous</button>
          <button onClick={() => setTab("pending")} data-testid="tab-pending" className={`text-xs uppercase tracking-widest font-bold px-2 py-1 shrink-0 ${tab === "pending" ? "text-cc-text" : "text-cc-muted hover:text-cc-text"}`}>En attente</button>
          <button onClick={() => setTab("add")} data-testid="tab-add" className={`text-xs uppercase tracking-widest font-bold px-3 py-1 bg-cc-accent text-white ml-auto shrink-0`}>
            <UserPlus className="w-3 h-3 inline mr-1" /> <span className="hidden sm:inline">Ajouter un ami</span><span className="sm:hidden">Ajout</span>
          </button>
        </header>
        <FriendsManager tab={tab} friends={friends} reload={loadFriends} onDM={startDM} />
      </main>
    </>
  );
}
