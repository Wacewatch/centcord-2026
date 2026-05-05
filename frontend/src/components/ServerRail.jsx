import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Compass, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { initials, cn } from "../lib/utils";

function Tooltip({ label, children }) {
  return (
    <div className="group relative flex items-center">
      {children}
      <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap bg-cc-surface2 border border-cc-border text-cc-text text-xs uppercase tracking-widest font-bold px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
          "relative w-12 h-12 flex items-center justify-center text-cc-text transition-all border",
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
  const path = window.location.pathname;
  const homeActive = path.startsWith("/app/me");
  const discoverActive = path.startsWith("/app/discover");
  const settingsActive = path.startsWith("/app/settings");

  return (
    <aside className="w-20 bg-cc-base border-r border-cc-border flex flex-col items-center py-5 gap-3 shrink-0">
      <RailItem active={homeActive} onClick={() => navigate("/app/me")} label="Direct Messages" testId="rail-home">
        <MessageSquare className="w-5 h-5" />
      </RailItem>
      <div className="cc-divider w-10" />
      {servers.map((s) => {
        const active = s.server_id === serverId;
        return (
          <RailItem
            key={s.server_id}
            active={active}
            onClick={() => navigate(`/app/servers/${s.server_id}`)}
            label={s.name}
            testId={`rail-server-${s.server_id}`}
          >
            {s.icon_url ? (
              <img src={s.icon_url} alt={s.name} className="w-full h-full object-cover rounded-[inherit]" />
            ) : (
              <span className="font-display font-extrabold text-base">{initials(s.name)}</span>
            )}
          </RailItem>
        );
      })}
      <RailItem onClick={onCreate} label="Create server" testId="rail-create">
        <Plus className="w-5 h-5" />
      </RailItem>
      <RailItem active={discoverActive} onClick={() => navigate("/app/discover")} label="Discover servers" testId="rail-discover">
        <Compass className="w-5 h-5" />
      </RailItem>
      <div className="mt-auto" />
      <RailItem active={settingsActive} onClick={() => navigate("/app/settings")} label="Settings" testId="rail-settings">
        <SettingsIcon className="w-5 h-5" />
      </RailItem>
    </aside>
  );
}
