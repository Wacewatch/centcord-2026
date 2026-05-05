import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { initials, presenceColor } from "../lib/utils";
import { X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

/**
 * User profile popover/modal: shows display name, status, activity, badges, bio.
 * Admin: can award badges.
 */
export default function UserProfilePopover({ userId, onClose }) {
  const { user: me } = useAuth();
  const [profile, setProfile] = useState(null);
  const [badges, setBadges] = useState([]);
  const [allBadges, setAllBadges] = useState([]);
  const [selectedBadge, setSelectedBadge] = useState("");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [pr, bg, all] = await Promise.all([
          api.get(`/users/${userId}`),
          api.get(`/users/${userId}/badges`),
          api.get(`/badges/list`).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setProfile(pr.data);
        setBadges(bg.data || []);
        setAllBadges(all.data || []);
      } catch (e) {
        toast.error("Profil introuvable");
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const awardBadge = async () => {
    if (!selectedBadge) return;
    try {
      await api.post("/admin/badges", { user_id: userId, badge: selectedBadge });
      const { data } = await api.get(`/users/${userId}/badges`);
      setBadges(data || []);
      setSelectedBadge("");
      toast.success("Badge attribué");
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const revokeBadge = async (badge) => {
    if (!window.confirm("Retirer ce badge ?")) return;
    try {
      await api.delete(`/admin/badges/${userId}/${badge}`);
      setBadges(badges.filter(b => b.id !== badge));
      toast.success("Retiré");
    } catch (_) { toast.error("Échec"); }
  };

  if (!profile) {
    return (
      <div data-testid="profile-popover-loading" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
        <div className="cc-spinner" />
      </div>
    );
  }

  const isAdmin = me?.role === "admin";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div data-testid="user-profile-popover" onClick={(e) => e.stopPropagation()} className="bg-cc-surface1 border border-cc-border w-full max-w-md cc-brutal-shadow">
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-cc-border relative">
          <button onClick={onClose} className="absolute top-3 right-3 text-cc-muted hover:text-cc-text"><X className="w-4 h-4" /></button>
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="w-16 h-16 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-lg">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(profile.display_name)}
              </div>
              <span className={`absolute -bottom-1 -right-1 cc-status-dot ${presenceColor(profile.status)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-extrabold text-2xl uppercase tracking-tighter truncate">{profile.display_name}</div>
              {profile.pronouns && <div className="text-[10px] uppercase tracking-widest text-cc-muted">{profile.pronouns}</div>}
              {profile.activity_text && (
                <div className="mt-2 text-sm text-cc-subtext flex items-center gap-2" data-testid="profile-activity">
                  {profile.activity_emoji && <span>{profile.activity_emoji}</span>}
                  {profile.activity_type && <span className="text-[10px] uppercase tracking-widest text-cc-muted">{profile.activity_type === "playing" ? "Joue à" : profile.activity_type === "listening" ? "Écoute" : profile.activity_type === "watching" ? "Regarde" : profile.activity_type === "streaming" ? "Stream" : ""}</span>}
                  <span>{profile.activity_text}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="px-5 py-4 border-b border-cc-border">
          <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-cc-muted mb-2">Badges</div>
          {badges.length === 0 ? (
            <div className="text-cc-muted text-xs uppercase tracking-widest">Aucun badge</div>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="profile-badges">
              {badges.map((b) => (
                <div key={b.id} className="flex items-center gap-1 border border-cc-border bg-cc-surface2 px-2 py-1 text-xs" title={b.label} style={{ borderLeft: `3px solid ${b.color}` }}>
                  <span>{b.emoji}</span>
                  <span className="font-bold uppercase tracking-widest text-[10px]">{b.label}</span>
                  {isAdmin && b.id !== "admin" && <button onClick={() => revokeBadge(b.id)} className="ml-1 text-cc-muted hover:text-cc-danger">×</button>}
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <div className="mt-3 flex gap-2">
              <select value={selectedBadge} onChange={(e) => setSelectedBadge(e.target.value)} className="flex-1 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-2 py-1 text-xs" data-testid="award-badge-select">
                <option value="">— Attribuer un badge —</option>
                {allBadges.filter(b => b.id !== "admin" && !badges.find(x => x.id === b.id)).map(b => (
                  <option key={b.id} value={b.id}>{b.emoji} {b.label}</option>
                ))}
              </select>
              <button onClick={awardBadge} disabled={!selectedBadge} data-testid="award-badge-btn" className="bg-cc-accent text-white font-bold uppercase tracking-widest px-3 py-1 text-[10px] disabled:opacity-50">Attribuer</button>
            </div>
          )}
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="px-5 py-4 border-b border-cc-border">
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-cc-muted mb-2">À propos</div>
            <div className="text-sm text-cc-subtext whitespace-pre-wrap break-words">{profile.bio}</div>
          </div>
        )}

        {/* Member since */}
        <div className="px-5 py-3 text-[10px] uppercase tracking-widest text-cc-muted">
          Membre depuis le {new Date(profile.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}
