import React, { useState } from "react";
import { useAuth } from "../lib/auth";
import { initials, presenceColor } from "../lib/utils";
import { Mic, MicOff, Headphones, Settings as SettingsIcon, LogOut, Edit2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";

export default function UserBar() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [customStatus, setCustomStatus] = useState(user?.custom_status || "");

  if (!user) return null;

  const saveStatus = async () => {
    try {
      await api.patch("/users/me", { custom_status: customStatus });
      await refreshUser();
      setEditing(false);
      toast.success("Statut mis à jour");
    } catch (_) { toast.error("Échec de la mise à jour"); }
  };

  return (
    <div className="border-t border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-2">
      <div className="relative shrink-0">
        <div className="w-9 h-9 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border">
          {user.avatar_url ? <img src={user.avatar_url} alt="me" className="w-full h-full object-cover rounded-[inherit]" /> : initials(user.display_name)}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 cc-status-dot ${presenceColor(user.status)}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate" data-testid="userbar-name">{user.display_name}</div>
        {editing ? (
          <div className="flex gap-1 mt-0.5">
            <input
              autoFocus
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveStatus()}
              onBlur={saveStatus}
              placeholder="Définir un statut"
              className="flex-1 bg-transparent border-b border-cc-border focus:border-cc-accent outline-none text-xs py-0.5"
              data-testid="userbar-status-input"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            data-testid="userbar-status"
            className="text-[10px] text-cc-muted uppercase tracking-widest truncate hover:text-cc-accent flex items-center gap-1"
          >
            {user.custom_status || user.email} <Edit2 className="w-2.5 h-2.5 opacity-60" />
          </button>
        )}
      </div>
      <button data-testid="userbar-mute" onClick={() => setMuted(!muted)} className="p-2 hover:bg-cc-base text-cc-subtext hover:text-cc-text transition-colors">
        {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
      <button data-testid="userbar-deafen" onClick={() => setDeafened(!deafened)} className={`p-2 hover:bg-cc-base transition-colors ${deafened ? "text-cc-danger" : "text-cc-subtext hover:text-cc-text"}`}>
        <Headphones className="w-4 h-4" />
      </button>
      <button data-testid="userbar-settings" onClick={() => navigate("/app/settings")} className="p-2 hover:bg-cc-base text-cc-subtext hover:text-cc-text transition-colors">
        <SettingsIcon className="w-4 h-4" />
      </button>
      <button data-testid="userbar-logout" onClick={async () => { await logout(); navigate("/"); }} className="p-2 hover:bg-cc-base text-cc-subtext hover:text-cc-danger transition-colors">
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
