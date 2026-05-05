import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { toast } from "sonner";
import ModalShell from "./ModalShell";
import { useAuth } from "../../lib/auth";
import { useNavigate } from "react-router-dom";
import { Copy, Archive, AlertTriangle, ShieldAlert } from "lucide-react";
import { initials } from "../../lib/utils";

const TABS = [
  { id: "overview", label: "Aperçu" },
  { id: "roles", label: "Rôles" },
  { id: "invites", label: "Invitations" },
  { id: "emojis", label: "Émojis" },
  { id: "webhooks", label: "Webhooks" },
  { id: "bans", label: "Bannissements" },
  { id: "audit", label: "Journal d'audit" },
  { id: "danger", label: "Zone à risque" },
];

export default function ServerSettingsModal({ server, onClose, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState({ name: server.name, description: server.description, is_public: server.is_public });
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState([]);
  const [bans, setBans] = useState([]);
  const [audit, setAudit] = useState([]);
  const [emojis, setEmojis] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [newEmoji, setNewEmoji] = useState({ name: "", image_url: "" });
  const [newWebhook, setNewWebhook] = useState({ name: "", channel_id: "" });
  const [reportText, setReportText] = useState("");
  const isOwner = server.owner_id === user?.user_id;

  useEffect(() => {
    if (tab === "invites") api.get(`/servers/${server.server_id}/invites`).then(r => setInvites(r.data)).catch(() => {});
    if (tab === "bans") api.get(`/servers/${server.server_id}/bans`).then(r => setBans(r.data)).catch(() => {});
    if (tab === "audit") api.get(`/servers/${server.server_id}/audit-log`).then(r => setAudit(r.data)).catch(() => {});
    if (tab === "emojis") api.get(`/servers/${server.server_id}/emojis`).then(r => setEmojis(r.data)).catch(() => {});
    if (tab === "webhooks") api.get(`/servers/${server.server_id}/webhooks`).then(r => setWebhooks(r.data)).catch(() => {});
  }, [tab, server.server_id]);

  const save = async () => {
    setSaving(true);
    try { await api.patch(`/servers/${server.server_id}`, form); toast.success("Enregistré"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
    finally { setSaving(false); }
  };

  const newInvite = async () => {
    try { const { data } = await api.post(`/servers/${server.server_id}/invites`, { max_uses: 0, expires_in_minutes: 10080 }); setInvites([data, ...invites]); }
    catch (_) { toast.error("Échec"); }
  };
  const copy = (code) => { navigator.clipboard.writeText(code); toast.success("Copié"); };

  const archive = async () => {
    if (!window.confirm("Archiver ce serveur ? Il devient privé et lecture seule.")) return;
    try { await api.post(`/servers/${server.server_id}/archive`); toast.success("Serveur archivé"); onClose(); reload(); navigate("/app/me"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };
  const leaveServer = async () => {
    if (!window.confirm(`Quitter ${server.name} ?`)) return;
    try { await api.post(`/servers/${server.server_id}/leave`); toast.success("Vous avez quitté le serveur"); onClose(); reload(); navigate("/app/me"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };
  const reportServer = async () => {
    if (reportText.trim().length < 10) { toast.error("Description trop courte (10 caractères min)"); return; }
    try {
      await api.post("/reports", {
        target_type: "server", target_id: server.server_id,
        category: "illegal", description: reportText
      });
      toast.success("Signalement envoyé. Notre équipe va l'examiner.");
      setReportText("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec du signalement"); }
  };

  const createEmoji = async () => {
    if (!newEmoji.name || !newEmoji.image_url) return;
    try {
      const { data } = await api.post(`/servers/${server.server_id}/emojis`, newEmoji);
      setEmojis([data, ...emojis]); setNewEmoji({ name: "", image_url: "" }); toast.success("Émoji ajouté");
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const uploadEmojiFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setNewEmoji((prev) => ({ ...prev, image_url: `${process.env.REACT_APP_BACKEND_URL}${data.url}` }));
    } catch (_) { toast.error("Échec du téléversement"); }
    finally { e.target.value = ""; }
  };

  const deleteEmoji = async (id) => {
    try { await api.delete(`/servers/${server.server_id}/emojis/${id}`); setEmojis(emojis.filter(x => x.emoji_id !== id)); }
    catch (_) { toast.error("Échec"); }
  };

  const createWebhook = async () => {
    if (!newWebhook.name || !newWebhook.channel_id) { toast.error("Nom et salon requis"); return; }
    try {
      const { data } = await api.post(`/servers/${server.server_id}/webhooks`, newWebhook);
      setWebhooks([data, ...webhooks]); setNewWebhook({ name: "", channel_id: "" }); toast.success("Webhook créé");
    } catch (_) { toast.error("Échec"); }
  };
  const deleteWebhook = async (id) => {
    try { await api.delete(`/servers/${server.server_id}/webhooks/${id}`); setWebhooks(webhooks.filter(w => w.webhook_id !== id)); }
    catch (_) { toast.error("Échec"); }
  };

  return (
    <ModalShell title={`${server.name} · paramètres`} onClose={onClose} testId="server-settings-modal" wide>
      <div className="grid grid-cols-12 gap-6 mt-2">
        <nav className="col-span-3 space-y-1 border-r border-cc-border pr-3">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`server-tab-${t.id}`} className={`w-full text-left px-3 py-2 text-sm transition-colors ${tab === t.id ? "bg-cc-surface2 text-cc-text" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text"}`}>{t.label}</button>
          ))}
        </nav>
        <div className="col-span-9 max-h-[60vh] overflow-y-auto">
          {tab === "overview" && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Nom</label>
                <input data-testid="server-edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Description</label>
                <textarea data-testid="server-edit-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} className="accent-cc-accent w-4 h-4" data-testid="server-edit-public" />
                <span className="text-sm">Public — apparaît dans la découverte</span>
              </label>
              <button data-testid="server-edit-save" onClick={save} disabled={saving} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-5 py-2.5 cc-brutal-shadow cc-brutal-press disabled:opacity-50">{saving ? "Enregistrement" : "Enregistrer"}</button>
            </div>
          )}
          {tab === "roles" && (
            <div>
              <ul className="space-y-2">
                {(server.roles || []).map((r) => (
                  <li key={r.role_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-3">
                    <span className="w-3 h-3" style={{ background: r.color }} />
                    <span className="font-display font-bold">{r.name}</span>
                    {r.is_default && <span className="text-[9px] uppercase tracking-widest text-cc-muted">par défaut</span>}
                    <span className="ml-auto text-[10px] uppercase tracking-widest text-cc-muted">perms : {r.permissions}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-cc-muted mt-3 uppercase tracking-widest">UI permissions personnalisées en V2.</p>
            </div>
          )}
          {tab === "invites" && (
            <div>
              <button data-testid="invite-create" onClick={newInvite} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-4 py-2 cc-brutal-shadow cc-brutal-press mb-4">Créer une invitation</button>
              <ul className="space-y-2">
                <li className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center justify-between">
                  <span className="font-mono text-sm">{server.invite_code} <span className="text-[10px] uppercase tracking-widest text-cc-muted ml-2">par défaut</span></span>
                  <button onClick={() => copy(server.invite_code)} className="text-cc-subtext hover:text-cc-accent" title="Copier"><Copy className="w-3.5 h-3.5" /></button>
                </li>
                {invites.map((inv) => (
                  <li key={inv.invite_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center justify-between">
                    <span className="font-mono text-sm">{inv.code}</span>
                    <span className="text-[10px] uppercase tracking-widest text-cc-muted">utilisations : {inv.uses}/{inv.max_uses || "∞"}</span>
                    <button onClick={() => copy(inv.code)} className="text-cc-subtext hover:text-cc-accent" title="Copier"><Copy className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === "emojis" && (
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-4">Émojis personnalisés</h3>
              <div className="space-y-2 mb-4">
                <input value={newEmoji.name} onChange={(e) => setNewEmoji({ ...newEmoji, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="nom_emoji" data-testid="emoji-name" className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 font-jetbrains" maxLength={32} />
                <div className="flex gap-2 items-center">
                  <input value={newEmoji.image_url} onChange={(e) => setNewEmoji({ ...newEmoji, image_url: e.target.value })} placeholder="URL de l'image" className="flex-1 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 font-jetbrains text-xs" />
                  <label className="bg-cc-surface2 border border-cc-border px-3 py-2 text-xs uppercase tracking-widest font-bold cursor-pointer">Téléverser<input type="file" accept="image/*" className="hidden" onChange={uploadEmojiFile} /></label>
                </div>
                {newEmoji.image_url && <img src={newEmoji.image_url} alt="" className="w-12 h-12 object-cover border border-cc-border" />}
                <button onClick={createEmoji} data-testid="emoji-create" className="bg-cc-accent text-white font-bold uppercase tracking-wide px-4 py-2 cc-brutal-shadow cc-brutal-press">Ajouter l'émoji</button>
              </div>
              <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {emojis.map((em) => (
                  <li key={em.emoji_id} className="border border-cc-border bg-cc-surface2 p-2 flex items-center gap-2 group">
                    <img src={em.image_url} alt={em.name} className="w-8 h-8 object-cover" />
                    <span className="font-mono text-xs flex-1 truncate">:{em.name}:</span>
                    <button onClick={() => deleteEmoji(em.emoji_id)} className="opacity-0 group-hover:opacity-100 text-cc-muted hover:text-cc-danger text-xs">×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === "webhooks" && (
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-4">Webhooks</h3>
              <div className="space-y-2 mb-6">
                <input value={newWebhook.name} onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })} placeholder="Nom du webhook" className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2" />
                <select value={newWebhook.channel_id} onChange={(e) => setNewWebhook({ ...newWebhook, channel_id: e.target.value })} className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2">
                  <option value="">Choisir un salon</option>
                  {(server.channels || []).filter(c => c.type === "text").map(c => <option key={c.channel_id} value={c.channel_id}>#{c.name}</option>)}
                </select>
                <button onClick={createWebhook} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-4 py-2 cc-brutal-shadow cc-brutal-press">Créer le webhook</button>
              </div>
              <ul className="space-y-2">
                {webhooks.map(w => (
                  <li key={w.webhook_id} className="border border-cc-border bg-cc-surface2 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-display font-bold">{w.name}</div>
                      <button onClick={() => deleteWebhook(w.webhook_id)} className="text-cc-muted hover:text-cc-danger text-xs uppercase tracking-widest">Supprimer</button>
                    </div>
                    <div className="text-[10px] text-cc-muted mt-1 break-all">URL : POST /api/webhooks/{w.webhook_id}/execute?token={w.token}</div>
                  </li>
                ))}
                {webhooks.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">Aucun webhook.</li>}
              </ul>
            </div>
          )}
          {tab === "bans" && (
            <ul className="space-y-2">
              {bans.map((b) => (
                <li key={b.user_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-3">
                  <div className="w-7 h-7 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px]">{initials(b.user?.display_name || "?")}</div>
                  <span className="text-sm">{b.user?.display_name || b.user_id}</span>
                  <button onClick={async () => { await api.delete(`/servers/${server.server_id}/bans/${b.user_id}`); setBans(bans.filter(x => x.user_id !== b.user_id)); toast.success("Débanni"); }} className="ml-auto text-xs uppercase tracking-widest font-bold text-cc-accent hover:text-cc-text">Débannir</button>
                </li>
              ))}
              {bans.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">Aucun bannissement.</li>}
            </ul>
          )}
          {tab === "audit" && (
            <ul className="space-y-2">
              {audit.map((a) => (
                <li key={a.audit_id} className="border-l-2 border-cc-accent pl-3 py-1 text-sm">
                  <div className="text-cc-text">{a.actor?.display_name || a.actor_id} · <span className="text-cc-accent uppercase tracking-widest text-[10px]">{a.action}</span></div>
                  <div className="text-[10px] text-cc-muted">{a.at}</div>
                </li>
              ))}
              {audit.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">Aucune action.</li>}
            </ul>
          )}
          {tab === "danger" && (
            <div className="space-y-4">
              <div className="border border-cc-border bg-cc-surface2 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-cc-accent" />
                  <h3 className="font-display font-bold uppercase tracking-tight">Politique anti-DMCA</h3>
                </div>
                <p className="text-cc-subtext text-xs leading-relaxed">
                  Aucun serveur n'est supprimé sauf en cas d'activité illégale confirmée. Vous pouvez archiver votre serveur (lecture seule, masqué) ou le quitter, mais pas le supprimer.
                </p>
              </div>
              {!isOwner && (
                <button onClick={leaveServer} data-testid="leave-server" className="w-full border border-cc-danger text-cc-danger uppercase tracking-widest font-bold py-3 hover:bg-cc-danger hover:text-white transition-colors">Quitter le serveur</button>
              )}
              {isOwner && (
                <button onClick={archive} data-testid="archive-server" className="w-full border border-cc-border text-cc-text uppercase tracking-widest font-bold py-3 hover:bg-cc-surface2 transition-colors flex items-center justify-center gap-2">
                  <Archive className="w-4 h-4" /> Archiver le serveur
                </button>
              )}
              <div className="border border-cc-border bg-cc-surface2 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-cc-danger" />
                  <h3 className="font-display font-bold uppercase tracking-tight">Signaler une activité illégale</h3>
                </div>
                <textarea value={reportText} onChange={(e) => setReportText(e.target.value)} rows={3} placeholder="Décrivez précisément le problème (10 caractères min)" className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 text-sm" data-testid="report-desc" />
                <button onClick={reportServer} data-testid="report-submit" className="mt-2 border border-cc-danger text-cc-danger uppercase tracking-widest font-bold px-4 py-2 hover:bg-cc-danger hover:text-white transition-colors text-xs">
                  Envoyer le signalement
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
