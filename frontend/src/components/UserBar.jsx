import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../lib/auth";
import { initials, presenceColor } from "../lib/utils";
import { Settings as SettingsIcon, LogOut, Edit2, Check, X, Sun, Moon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";
import { useTheme } from "../lib/theme";

/**
 * Clean, refined bottom-left user bar.
 * - Left: Avatar + name + status (click-to-edit)
 * - Right: compact settings & logout icons (divider between them)
 */
export default function UserBar() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [editing, setEditing] = useState(false);
  const [customStatus, setCustomStatus] = useState(user?.custom_status || "");
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (!user) return null;

  const saveStatus = async () => {
    try {
      await api.patch("/users/me", { custom_status: customStatus });
      await refreshUser();
      setEditing(false);
      toast.success("Statut mis à jour");
    } catch (_) { toast.error("Échec de la mise à jour"); }
  };

  const cancelEdit = () => {
    setCustomStatus(user?.custom_status || "");
    setEditing(false);
  };

  return (
    <div className="border-t border-cc-border bg-cc-surface2 flex items-stretch">
      {/* Clickable profile zone */}
      <button
        onClick={() => !editing && setEditing(true)}
        className="group flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 hover:bg-cc-base/60 transition-colors text-left"
        data-testid="userbar-profile"
      >
        <div className="relative shrink-0">
          <div className="w-9 h-9 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-md border border-cc-border overflow-hidden ring-2 ring-transparent group-hover:ring-cc-accent/30 transition-all">
            {user.avatar_url
              ? <img src={user.avatar_url} alt="me" className="w-full h-full object-cover" />
              : <span className="text-xs">{initials(user.display_name)}</span>}
          </div>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-cc-surface2 ${presenceColor(user.status)}`}
            aria-hidden
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-cc-text truncate leading-tight" data-testid="userbar-name">
            {user.display_name}
          </div>
          {editing ? (
            <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveStatus();
                  if (e.key === "Escape") cancelEdit();
                }}
                maxLength={64}
                placeholder="Définir un statut personnalisé"
                className="flex-1 min-w-0 bg-cc-base border border-cc-borderSoft focus:border-cc-accent outline-none text-[11px] py-0.5 px-1.5 rounded"
                data-testid="userbar-status-input"
              />
              <button onClick={saveStatus} className="p-0.5 text-cc-success hover:text-white" title="Enregistrer">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} className="p-0.5 text-cc-muted hover:text-cc-danger" title="Annuler">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-cc-subtext truncate leading-tight mt-0.5" data-testid="userbar-status">
              <span className="truncate">
                {user.custom_status || <span className="text-cc-muted">#{user.user_id?.slice(-5)}</span>}
              </span>
              <Edit2 className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 shrink-0" />
            </div>
          )}
        </div>
      </button>

      {/* Actions cluster */}
      <div className="flex items-center gap-0.5 px-1.5 border-l border-cc-border/60">
        <button
          data-testid="userbar-theme"
          onClick={toggle}
          className="p-2 rounded-md text-cc-subtext hover:text-cc-accent hover:bg-cc-base transition-colors"
          title={theme === "dark" ? "Mode clair" : "Mode sombre"}
          aria-label="Changer de thème"
        >
          {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
        <button
          data-testid="userbar-settings"
          onClick={() => navigate("/app/settings")}
          className="p-2 rounded-md text-cc-subtext hover:text-cc-text hover:bg-cc-base transition-colors"
          title="Paramètres"
          aria-label="Paramètres"
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
        </button>
        <button
          data-testid="userbar-logout"
          onClick={async () => { await logout(); navigate("/"); }}
          className="p-2 rounded-md text-cc-subtext hover:text-cc-danger hover:bg-cc-base transition-colors"
          title="Se déconnecter"
          aria-label="Se déconnecter"
        >
          <LogOut className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}
