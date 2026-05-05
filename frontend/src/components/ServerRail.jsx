import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Compass, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { initials, cn } from "../lib/utils";
import { useMobile } from "../lib/mobile";

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

function RailItem({ active, children, onClick, label, testId }) {
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
        {children}
      </motion.button>
    </Tooltip>
  );
}

export default function ServerRail({ servers, onCreate, onJoin }) {
  const navigate = useNavigate();
  const { serverId } = useParams();
  const { isMobile, drawerOpen, closeDrawer } = useMobile();
  const path = window.location.pathname;
  const homeActive = path.startsWith("/app/me");
  const discoverActive = path.startsWith("/app/discover");
  const settingsActive = path.startsWith("/app/settings");

  const go = (to) => { navigate(to); if (isMobile) closeDrawer(); };

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
          return (
            <RailItem
              key={s.server_id}
              active={active}
              onClick={() => go(`/app/servers/${s.server_id}`)}
              label={s.name}
              testId={`rail-server-${s.server_id}`}
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
