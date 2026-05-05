import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Compass, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { initials, cn } from "../lib/utils";
import { useMobile } from "../lib/mobile";
import { useWS } from "../lib/ws";
import api from "../lib/api";

function Tooltip({ label, children }) {
  return (
    <div className="group relative flex items-center">
      {children}
      <span className="pointer-events-none hidden md:inline absolute left-full ml-3 z-50 whitespace-nowrap bg-cc-surface2 border border-cc-border text-cc-text text-xs uppercase tracking-widest font-bold px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {label}
      </span>
    </div>
  );
}

function RailItem({ active, children, onClick, label, testId, badge }) {
  return (
    <Tooltip label={label}>
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={onClick}
        data-testid={testId}
        className={cn(
          "relative w-12 h-12 flex items-center justify-center text-cc-text transition-all border overflow-hidden",
          active ? "bg-cc-accent border-transparent rounded-sm" : "bg-cc-surface2 border-cc-border rounded-xl hover:rounded-sm hover:bg-cc-accent hover:border-transparent"
        )}
      >
        {active && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-7 bg-cc-accent" />}
        {!active && badge > 0 && (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-3 bg-white" />
        )}
        {children}
        {badge > 0 && (
          <span
            data-testid={`rail-badge-${testId}`}
            className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-cc-danger text-white text-[10px] font-extrabold rounded-full border-2 border-cc-base shadow"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </motion.button>
    </Tooltip>
  );
}

export default function ServerRail({ servers, onCreate, onJoin }) {
  const navigate = useNavigate();
  const { serverId } = useParams();
  const { isMobile, drawerOpen, closeDrawer } = useMobile();
  const ws = useWS();
  const [unread, setUnread] = useState({}); // { server_id: count }

  const path = window.location.pathname;
  const homeActive = path.startsWith("/app/me");
  const discoverActive = path.startsWith("/app/discover");
  const settingsActive = path.startsWith("/app/settings");

  const loadUnread = useCallback(async () => {
    try { const { data } = await api.get("/servers/unread"); setUnread(data || {}); } catch (_) {}
  }, []);

  useEffect(() => { loadUnread(); }, [loadUnread]);

  // Live: update server unread badges as messages arrive / get read
  useEffect(() => {
    if (!ws) return;
    const offCreate = ws.subscribe("message.create", (m) => {
      if (!m?.server_id || !m?.channel_id) return;
      // Avoid increment for messages in the currently-viewed channel; ServerView handles markRead
      const inActiveChannel = path.includes(`/channels/${m.channel_id}`);
      if (inActiveChannel) return;
      setUnread((u) => ({ ...u, [m.server_id]: (u[m.server_id] || 0) + 1 }));
    });
    const offRefresh = ws.subscribe("server.delete", () => loadUnread());
    const offRefresh2 = ws.subscribe("server.join", () => loadUnread());
    // Refresh every 30s to stay in sync after read events
    const intv = setInterval(loadUnread, 30000);
    return () => { offCreate(); offRefresh(); offRefresh2(); clearInterval(intv); };
  }, [ws, path, loadUnread]);

  const go = (to, sid) => {
    navigate(to);
    if (sid) setUnread((u) => { const n = { ...u }; delete n[sid]; return n; });
    if (isMobile) closeDrawer();
  };

  return (
    <aside
      className={cn(
        "bg-cc-base border-r border-cc-border flex flex-col items-center py-5 gap-3 shrink-0 w-20 transition-transform duration-300 ease-out",
        // Mobile: overlay drawer
        isMobile ? "fixed inset-y-0 left-0 z-40 h-[100dvh]" : "",
        isMobile && !drawerOpen ? "-translate-x-full" : "translate-x-0"
      )}
    >
      <RailItem active={homeActive} onClick={() => go("/app/me")} label="Messages privés" testId="rail-home">
        <MessageSquare className="w-5 h-5" />
      </RailItem>
      <div className="cc-divider w-10" />
      <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-3 no-scrollbar">
        {servers.map((s) => {
          const active = s.server_id === serverId;
          const count = unread[s.server_id] || 0;
          return (
            <RailItem
              key={s.server_id}
              active={active}
              onClick={() => go(`/app/servers/${s.server_id}`, s.server_id)}
              label={s.name}
              testId={`rail-server-${s.server_id}`}
              badge={count}
            >
              {s.icon_url ? (
                <img src={s.icon_url} alt={s.name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display font-extrabold text-base">{initials(s.name)}</span>
              )}
            </RailItem>
          );
        })}
        <RailItem onClick={onCreate} label="Créer un serveur" testId="rail-create">
          <Plus className="w-5 h-5" />
        </RailItem>
        <RailItem active={discoverActive} onClick={() => go("/app/discover")} label="Découvrir des serveurs" testId="rail-discover">
          <Compass className="w-5 h-5" />
        </RailItem>
      </div>
      <RailItem active={settingsActive} onClick={() => go("/app/settings")} label="Paramètres" testId="rail-settings">
        <SettingsIcon className="w-5 h-5" />
      </RailItem>
    </aside>
  );
}
