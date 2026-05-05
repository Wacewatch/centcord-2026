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
  { id: "stats", label: "Statistiques" },
  { id: "roles", label: "Rôles" },
  { id: "categories", label: "Catégories" },
  { id: "invites", label: "Invitations" },
  { id: "emojis", label: "Émojis" },
  { id: "stickers", label: "Stickers" },
  { id: "webhooks", label: "Webhooks" },
  { id: "mention-perms", label: "Mentions" },
  { id: "bans", label: "Bannissements" },
  { id: "audit", label: "Journal d'audit" },
  { id: "danger", label: "Zone à risque" },
];

export default function ServerSettingsModal({ server, onClose, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState({ name: server.name, description: server.description, is_public: server.is_public });
  const [tagsInput, setTagsInput] = useState((server.tags || []).join(", "));
  const [stats, setStats] = useState(null);
  const [categoriesList, setCategoriesList] = useState(server.categories || []);
  const [stickers, setStickers] = useState([]);
  const [newSticker, setNewSticker] = useState({ name: "", image_url: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState([]);
  const [bans, setBans] = useState([]);
  const [audit, setAudit] = useState([]);
  const [emojis, setEmojis] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [newEmoji, setNewEmoji] = useState({ name: "", image_url: "" });
  const [newWebhook, setNewWebhook] = useState({ name: "", channel_id: "" });
  const [reportText, setReportText] = useState("");
  const [selectedChannelForPerms, setSelectedChannelForPerms] = useState(null);
  const isOwner = server.owner_id === user?.user_id;

  useEffect(() => {
    if (tab === "invites") api.get(`/servers/${server.server_id}/invites`).then(r => setInvites(r.data)).catch(() => {});
    if (tab === "bans") api.get(`/servers/${server.server_id}/bans`).then(r => setBans(r.data)).catch(() => {});
    if (tab === "audit") api.get(`/servers/${server.server_id}/audit-log`).then(r => setAudit(r.data)).catch(() => {});
    if (tab === "emojis") api.get(`/servers/${server.server_id}/emojis`).then(r => setEmojis(r.data)).catch(() => {});
    if (tab === "webhooks") api.get(`/servers/${server.server_id}/webhooks`).then(r => setWebhooks(r.data)).catch(() => {});
    if (tab === "stats") api.get(`/servers/${server.server_id}/stats`).then(r => setStats(r.data)).catch(() => {});
    if (tab === "stickers") api.get(`/servers/${server.server_id}/stickers`).then(r => setStickers(r.data)).catch(() => {});
  }, [tab, server.server_id]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/servers/${server.server_id}`, form);
      // Save tags
      const tags = tagsInput.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      await api.patch(`/servers/${server.server_id}/tags`, { tags });
      toast.success("Enregistré"); reload();
    }
    catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
    finally { setSaving(false); }
  };

  const regenInviteCode = async () => {
    if (!window.confirm("Régénérer le code d'invitation ? L'ancien ne fonctionnera plus.")) return;
    try {
      const { data } = await api.post(`/servers/${server.server_id}/invite/regen`);
      toast.success(`Nouveau code : ${data.invite_code}`);
      reload();
    } catch (_) { toast.error("Échec"); }
  };

  const renameCategory = async (cat) => {
    const name = window.prompt("Nouveau nom de catégorie", cat.name);
    if (!name || name === cat.name) return;
    try {
      await api.patch(`/servers/${server.server_id}/categories/${cat.category_id}`, { name });
      setCategoriesList(categoriesList.map(c => c.category_id === cat.category_id ? { ...c, name: name.toUpperCase() } : c));
      toast.success("Renommée"); reload();
    } catch (_) { toast.error("Échec"); }
  };

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Supprimer la catégorie "${cat.name}" ?`)) return;
    try {
      await api.delete(`/servers/${server.server_id}/categories/${cat.category_id}`);
      setCategoriesList(categoriesList.filter(c => c.category_id !== cat.category_id));
      toast.success("Supprimée"); reload();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const createSticker = async () => {
    if (!newSticker.name || !newSticker.image_url) { toast.error("Nom et image requis"); return; }
    try {
      const { data } = await api.post(`/servers/${server.server_id}/stickers`, newSticker);
      setStickers([data, ...stickers]); setNewSticker({ name: "", image_url: "", tags: "" }); toast.success("Sticker ajouté");
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const uploadStickerFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setNewSticker((p) => ({ ...p, image_url: `${process.env.REACT_APP_BACKEND_URL}${data.url}` }));
    } catch (_) { toast.error("Échec du téléversement"); }
    finally { e.target.value = ""; }
  };

  const deleteSticker = async (id) => {
    try { await api.delete(`/servers/${server.server_id}/stickers/${id}`); setStickers(stickers.filter(s => s.sticker_id !== id)); }
    catch (_) { toast.error("Échec"); }
  };

  const updateMentionPerms = async (channelId, body) => {
    try {
      await api.patch(`/channels/${channelId}/mention-perms`, body);
      toast.success("Permissions mises à jour");
      reload();
    } catch (_) { toast.error("Échec"); }
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
              <div>
                <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Tags (séparés par virgules, max 8)</label>
                <input data-testid="server-edit-tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="gaming, fr, dev" className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2.5 font-jetbrains text-xs" />
              </div>
              <button data-testid="server-edit-save" onClick={save} disabled={saving} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-5 py-2.5 cc-brutal-shadow cc-brutal-press disabled:opacity-50">{saving ? "Enregistrement" : "Enregistrer"}</button>
            </div>
          )}
          {tab === "stats" && (
            <div className="space-y-4">
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-2">Statistiques</h3>
              {!stats ? <div className="cc-spinner mx-auto" /> : (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {label: "Membres", value: stats.member_count, testid: "stat-members"},
                    {label: "En ligne", value: stats.online_count, testid: "stat-online"},
                    {label: "Messages total", value: stats.message_count, testid: "stat-messages"},
                    {label: "Messages 7 j", value: stats.messages_7d, testid: "stat-messages-7d"},
                    {label: "Salons", value: stats.channel_count, testid: "stat-channels"},
                    {label: "Rôles", value: stats.role_count, testid: "stat-roles"},
                    {label: "Boosts", value: stats.boost_count, testid: "stat-boosts"},
                  ].map((s) => (
                    <div key={s.label} data-testid={s.testid} className="border border-cc-border bg-cc-surface2 px-4 py-3">
                      <div className="text-[10px] uppercase tracking-widest text-cc-muted">{s.label}</div>
                      <div className="font-display font-extrabold text-3xl mt-1">{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {tab === "categories" && (
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-4">Catégories</h3>
              <ul className="space-y-2">
                {categoriesList.map((cat) => (
                  <li key={cat.category_id} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-3">
                    <span className="font-display font-bold uppercase text-sm flex-1">{cat.name}</span>
                    <button onClick={() => renameCategory(cat)} data-testid={`cat-rename-${cat.category_id}`} className="text-[10px] uppercase tracking-widest font-bold text-cc-accent hover:text-cc-text">Renommer</button>
                    <button onClick={() => deleteCategory(cat)} className="text-[10px] uppercase tracking-widest font-bold text-cc-muted hover:text-cc-danger">Supprimer</button>
                  </li>
                ))}
                {categoriesList.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">Aucune catégorie.</li>}
              </ul>
            </div>
          )}
          {tab === "stickers" && (
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-4">Stickers du serveur</h3>
              <div className="space-y-2 mb-4">
                <input value={newSticker.name} onChange={(e) => setNewSticker({ ...newSticker, name: e.target.value })} placeholder="nom_sticker" data-testid="sticker-name" className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 font-jetbrains" maxLength={32} />
                <div className="flex gap-2 items-center">
                  <input value={newSticker.image_url} onChange={(e) => setNewSticker({ ...newSticker, image_url: e.target.value })} placeholder="URL de l'image (PNG/WEBP/GIF)" className="flex-1 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 font-jetbrains text-xs" />
                  <label className="bg-cc-surface2 border border-cc-border px-3 py-2 text-xs uppercase tracking-widest font-bold cursor-pointer">Téléverser<input type="file" accept="image/*" className="hidden" onChange={uploadStickerFile} /></label>
                </div>
                <input value={newSticker.tags} onChange={(e) => setNewSticker({ ...newSticker, tags: e.target.value })} placeholder="tags (optionnel)" className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 text-xs" />
                {newSticker.image_url && <img src={newSticker.image_url} alt="" className="w-20 h-20 object-cover border border-cc-border" />}
                <button onClick={createSticker} data-testid="sticker-create" className="bg-cc-accent text-white font-bold uppercase tracking-wide px-4 py-2 cc-brutal-shadow cc-brutal-press">Ajouter le sticker</button>
              </div>
              <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {stickers.map((st) => (
                  <li key={st.sticker_id} className="border border-cc-border bg-cc-surface2 p-2 flex flex-col items-center gap-1 group">
                    <img src={st.image_url} alt={st.name} className="w-16 h-16 object-cover" />
                    <span className="font-mono text-[10px] truncate w-full text-center">{st.name}</span>
                    <button onClick={() => deleteSticker(st.sticker_id)} className="opacity-0 group-hover:opacity-100 text-cc-muted hover:text-cc-danger text-xs uppercase tracking-widest">Supprimer</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === "mention-perms" && (
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-4">Permissions de mention par salon</h3>
              <select value={selectedChannelForPerms || ""} onChange={(e) => setSelectedChannelForPerms(e.target.value)} className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 mb-3" data-testid="perm-channel-select">
                <option value="">Choisir un salon</option>
                {(server.channels || []).filter(c => c.type === "text").map(c => <option key={c.channel_id} value={c.channel_id}>#{c.name}</option>)}
              </select>
              {selectedChannelForPerms && (() => {
                const ch = (server.channels || []).find(c => c.channel_id === selectedChannelForPerms);
                if (!ch) return null;
                return (
                  <div className="border border-cc-border bg-cc-surface2 p-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked={ch.mention_allow_everyone !== false} onChange={(e) => updateMentionPerms(ch.channel_id, { allow_everyone: e.target.checked })} className="accent-cc-accent w-4 h-4" data-testid="perm-everyone" />
                      <span className="text-sm">Autoriser <span className="font-mono">@everyone</span> / <span className="font-mono">@here</span></span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked={ch.mention_allow_role_ping !== false} onChange={(e) => updateMentionPerms(ch.channel_id, { allow_role_ping: e.target.checked })} className="accent-cc-accent w-4 h-4" data-testid="perm-roles" />
                      <span className="text-sm">Autoriser les mentions de rôles</span>
                    </label>
                  </div>
                );
              })()}
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
                <li className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-sm truncate">{server.invite_code} <span className="text-[10px] uppercase tracking-widest text-cc-muted ml-2">par défaut</span></span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => copy(server.invite_code)} className="text-cc-subtext hover:text-cc-accent" title="Copier"><Copy className="w-3.5 h-3.5" /></button>
                    {isOwner && <button onClick={regenInviteCode} data-testid="regen-invite" className="text-[10px] uppercase tracking-widest font-bold text-cc-accent hover:text-cc-text">Régénérer</button>}
                  </div>
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
