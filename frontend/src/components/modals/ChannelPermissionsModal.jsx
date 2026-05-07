import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api";
import { toast } from "sonner";

const PERM_DEFS = [
  { bit: 0,  key: "view",             label: "Voir le salon" },
  { bit: 1,  key: "send",             label: "Envoyer des messages" },
  { bit: 2,  key: "manage_messages",  label: "Gérer les messages" },
  { bit: 8,  key: "mention_everyone", label: "Mentionner @everyone" },
];

// Tri-state: "allow" | "deny" | "inherit"
// bitmask helpers using Math.pow (safe for bit 31)
const hasBit = (n, bit) => Math.floor((n || 0) / Math.pow(2, bit)) % 2 === 1;
const setBit = (n, bit) => hasBit(n, bit) ? n : n + Math.pow(2, bit);
const clearBit = (n, bit) => hasBit(n, bit) ? n - Math.pow(2, bit) : n;

function stateFor(allow, deny, bit) {
  if (hasBit(allow, bit)) return "allow";
  if (hasBit(deny, bit)) return "deny";
  return "inherit";
}
function cycleState(s) {
  return s === "inherit" ? "allow" : s === "allow" ? "deny" : "inherit";
}
function applyState(allow, deny, bit, state) {
  let a = allow;
  let d = deny;
  a = clearBit(a, bit);
  d = clearBit(d, bit);
  if (state === "allow") a = setBit(a, bit);
  if (state === "deny") d = setBit(d, bit);
  return { allow: a, deny: d };
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export default function ChannelPermissionsModal({ open, onClose, channel, server }) {
  const [overrides, setOverrides] = useState([]);
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null); // { target_type, target_id }
  const [picker, setPicker] = useState(null); // null | "role" | "user"
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open || !channel) return;
    setSelected(null);
    setPicker(null);
    setSearch("");
    api.get(`/channels/${channel.channel_id}/overrides`).then((r) => setOverrides(r.data || [])).catch(() => {});
    api.get(`/servers/${server.server_id}/members`).then((r) => setMembers(r.data || [])).catch(() => {});
  }, [open, channel, server]);

  const roles = useMemo(() => server?.roles || [], [server]);
  const roleMap = useMemo(() => Object.fromEntries(roles.map((r) => [r.role_id, r])), [roles]);
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m])), [members]);

  const currentOverride = useMemo(() => {
    if (!selected) return null;
    return overrides.find((o) => o.target_type === selected.target_type && o.target_id === selected.target_id) || { target_type: selected.target_type, target_id: selected.target_id, allow: 0, deny: 0 };
  }, [selected, overrides]);

  const saveOverride = async (next) => {
    try {
      const res = await api.put(`/channels/${channel.channel_id}/overrides`, {
        target_type: next.target_type,
        target_id: next.target_id,
        allow: next.allow || 0,
        deny: next.deny || 0,
      });
      setOverrides(res.data?.permission_overrides || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec");
    }
  };

  const onCycle = (bit) => {
    if (!currentOverride) return;
    const s = stateFor(currentOverride.allow, currentOverride.deny, bit);
    const ns = cycleState(s);
    const { allow, deny } = applyState(currentOverride.allow, currentOverride.deny, bit, ns);
    const next = { ...currentOverride, allow, deny };
    saveOverride(next);
  };

  const removeOverride = async (o) => {
    if (!window.confirm("Retirer cette surcharge ?")) return;
    try {
      await api.delete(`/channels/${channel.channel_id}/overrides/${o.target_type}/${o.target_id}`);
      setOverrides((prev) => prev.filter((x) => !(x.target_type === o.target_type && x.target_id === o.target_id)));
      if (selected && selected.target_type === o.target_type && selected.target_id === o.target_id) {
        setSelected(null);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec");
    }
  };

  const addTarget = (target_type, target_id) => {
    // Ensure exists in overrides with empty perms
    if (!overrides.some((o) => o.target_type === target_type && o.target_id === target_id)) {
      // Save an empty override to persist presence. But backend removes on allow=0/deny=0.
      // Workaround: only create entry visually; saving requires at least 1 bit.
      setOverrides((prev) => [...prev, { target_type, target_id, allow: 0, deny: 0 }]);
    }
    setSelected({ target_type, target_id });
    setPicker(null);
    setSearch("");
  };

  if (!open || !channel) return null;

  const existingTargets = overrides.map((o) => ({ type: o.target_type, id: o.target_id }));

  const targetLabel = (o) => {
    if (o.target_type === "role") {
      const r = roleMap[o.target_id];
      return { name: r?.name || "Rôle supprimé", color: r?.color || "#64748B", sub: r?.is_default ? "par défaut" : "rôle" };
    }
    const m = memberMap[o.target_id];
    return { name: m?.nickname || m?.user?.display_name || "Membre inconnu", color: "#64748B", sub: "membre", avatar: m?.user?.avatar_url };
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-cc-base border-4 border-cc-border cc-brutal-shadow max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b-2 border-cc-border bg-cc-surface1">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-cc-muted">Permissions du salon</div>
            <div className="font-display font-extrabold text-xl uppercase tracking-tight">#{channel.name}</div>
          </div>
          <button onClick={onClose} className="text-cc-muted hover:text-cc-text text-2xl font-bold leading-none" aria-label="Fermer">×</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: targets list */}
          <div className="w-64 border-r-2 border-cc-border bg-cc-surface1 flex flex-col shrink-0">
            <div className="p-3 border-b border-cc-border">
              <button onClick={() => setPicker("role")} data-testid="chov-add-role" className="w-full text-left text-[10px] uppercase tracking-widest font-bold px-2 py-2 border border-cc-border bg-cc-base hover:bg-cc-surface2 mb-2">+ Ajouter un rôle</button>
              <button onClick={() => setPicker("user")} data-testid="chov-add-user" className="w-full text-left text-[10px] uppercase tracking-widest font-bold px-2 py-2 border border-cc-border bg-cc-base hover:bg-cc-surface2">+ Ajouter un membre</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {overrides.length === 0 && (
                <div className="p-4 text-[10px] uppercase tracking-widest text-cc-muted text-center">Aucune surcharge. Par défaut, le salon hérite des permissions du serveur.</div>
              )}
              {overrides.map((o) => {
                const t = targetLabel(o);
                const active = selected && selected.target_type === o.target_type && selected.target_id === o.target_id;
                return (
                  <button
                    key={`${o.target_type}-${o.target_id}`}
                    onClick={() => setSelected({ target_type: o.target_type, target_id: o.target_id })}
                    data-testid={`chov-row-${o.target_type}-${o.target_id}`}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 border-b border-cc-border/50 hover:bg-cc-surface2 ${active ? "bg-cc-surface2" : ""}`}
                  >
                    {o.target_type === "role" ? (
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: t.color }} />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-cc-base border border-cc-border flex items-center justify-center text-[9px] font-bold shrink-0 overflow-hidden">
                        {t.avatar ? <img src={t.avatar} alt="" className="w-full h-full object-cover" /> : initials(t.name)}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate" style={o.target_type === "role" ? { color: t.color } : undefined}>{t.name}</span>
                      <span className="block text-[9px] uppercase tracking-widest text-cc-muted">{t.sub}</span>
                    </span>
                    {(o.allow || o.deny) ? <span className="text-[9px] uppercase tracking-widest text-cc-accent font-bold shrink-0">actif</span> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: editor */}
          <div className="flex-1 overflow-y-auto p-5">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-cc-muted text-sm uppercase tracking-widest text-center">
                {picker ? (
                  <div className="w-full max-w-md">
                    <div className="text-cc-text font-display font-extrabold text-xl uppercase tracking-tight mb-3">
                      {picker === "role" ? "Choisir un rôle" : "Choisir un membre"}
                    </div>
                    <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full bg-cc-surface2 border border-cc-border focus:border-cc-accent outline-none px-3 py-2 mb-2 text-sm normal-case tracking-normal text-cc-text" data-testid="chov-picker-search" />
                    <div className="border border-cc-border bg-cc-surface2 max-h-72 overflow-y-auto divide-y divide-cc-border">
                      {picker === "role" && roles
                        .filter((r) => !existingTargets.some((t) => t.type === "role" && t.id === r.role_id))
                        .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()))
                        .map((r) => (
                          <button key={r.role_id} onClick={() => addTarget("role", r.role_id)} data-testid={`chov-pick-role-${r.role_id}`} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-cc-surface1 text-left">
                            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: r.color }} />
                            <span className="font-bold text-sm normal-case tracking-normal text-cc-text" style={{ color: r.color }}>{r.name}</span>
                          </button>
                        ))}
                      {picker === "user" && members
                        .filter((m) => !existingTargets.some((t) => t.type === "user" && t.id === m.user_id))
                        .filter((m) => !search || (m.nickname || m.user?.display_name || "").toLowerCase().includes(search.toLowerCase()))
                        .map((m) => (
                          <button key={m.user_id} onClick={() => addTarget("user", m.user_id)} data-testid={`chov-pick-user-${m.user_id}`} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-cc-surface1 text-left">
                            <span className="w-6 h-6 rounded-full bg-cc-base border border-cc-border flex items-center justify-center text-[9px] font-bold shrink-0 overflow-hidden">
                              {m.user?.avatar_url ? <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(m.user?.display_name || "?")}
                            </span>
                            <span className="font-bold text-sm normal-case tracking-normal text-cc-text">{m.nickname || m.user?.display_name}</span>
                          </button>
                        ))}
                    </div>
                    <button onClick={() => { setPicker(null); setSearch(""); }} className="mt-3 text-[10px] uppercase tracking-widest text-cc-muted hover:text-cc-text">← Annuler</button>
                  </div>
                ) : (
                  <span>Ajoute un rôle ou un membre pour définir ses permissions spécifiques sur ce salon.</span>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-cc-muted">Surcharge pour</div>
                    <div className="font-display font-extrabold text-2xl uppercase tracking-tight truncate" style={currentOverride.target_type === "role" ? { color: roleMap[currentOverride.target_id]?.color } : undefined}>
                      {currentOverride.target_type === "role"
                        ? (roleMap[currentOverride.target_id]?.name || "Rôle supprimé")
                        : (memberMap[currentOverride.target_id]?.nickname || memberMap[currentOverride.target_id]?.user?.display_name || "Membre inconnu")}
                    </div>
                  </div>
                  {(currentOverride.allow || currentOverride.deny) ? (
                    <button onClick={() => removeOverride(currentOverride)} data-testid="chov-delete" className="shrink-0 text-[10px] uppercase tracking-widest text-cc-danger hover:text-cc-accent font-bold border border-cc-danger/40 px-3 py-2">Supprimer la surcharge</button>
                  ) : null}
                </div>

                <div className="border border-cc-border bg-cc-surface2">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-[10px] uppercase tracking-widest text-cc-muted px-3 py-2 border-b border-cc-border">
                    <span>Permission</span>
                    <span className="px-2">Refuser</span>
                    <span className="px-2">Hériter</span>
                    <span className="px-2">Autoriser</span>
                  </div>
                  {PERM_DEFS.map((p) => {
                    const s = stateFor(currentOverride.allow, currentOverride.deny, p.bit);
                    const setS = (target) => {
                      const { allow, deny } = applyState(currentOverride.allow, currentOverride.deny, p.bit, target);
                      saveOverride({ ...currentOverride, allow, deny });
                    };
                    return (
                      <div key={p.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-0 px-3 py-2 border-b border-cc-border/50 last:border-b-0">
                        <span className="text-sm font-bold">{p.label}</span>
                        <button onClick={() => setS("deny")} data-testid={`chov-${p.key}-deny`} className={`w-10 h-8 mx-1 flex items-center justify-center border font-bold text-lg ${s === "deny" ? "border-cc-danger text-cc-danger bg-cc-danger/10" : "border-cc-border text-cc-muted hover:text-cc-danger"}`} aria-label={`Refuser ${p.label}`}>✕</button>
                        <button onClick={() => setS("inherit")} data-testid={`chov-${p.key}-inherit`} className={`w-10 h-8 mx-1 flex items-center justify-center border font-bold ${s === "inherit" ? "border-cc-text text-cc-text bg-cc-surface1" : "border-cc-border text-cc-muted hover:text-cc-text"}`} aria-label={`Hériter ${p.label}`}>/</button>
                        <button onClick={() => setS("allow")} data-testid={`chov-${p.key}-allow`} className={`w-10 h-8 mx-1 flex items-center justify-center border font-bold text-lg ${s === "allow" ? "border-cc-accent text-cc-accent bg-cc-accent/10" : "border-cc-border text-cc-muted hover:text-cc-accent"}`} aria-label={`Autoriser ${p.label}`}>✓</button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] uppercase tracking-widest text-cc-muted">
                  <span className="text-cc-accent">✓ Autoriser</span> ajoute la permission. <span className="text-cc-danger">✕ Refuser</span> la retire. <span className="text-cc-text">/ Hériter</span> utilise la valeur du serveur. L'ordre d'application : @everyone → rôles → utilisateur.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
