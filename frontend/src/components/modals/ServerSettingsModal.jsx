import React, { useEffect, useState } from "react";
import api from "../../lib/api";
import { toast } from "sonner";
import ModalShell from "./ModalShell";
import { useAuth } from "../../lib/auth";
import { useNavigate } from "react-router-dom";
import { Copy, Archive, AlertTriangle, ShieldAlert, Trash2, Bot, Upload, Eye, EyeOff, RefreshCw } from "lucide-react";
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
  { id: "bots", label: "Bots" },
  { id: "automod", label: "Auto-mod" },
  { id: "mention-perms", label: "Mentions" },
  { id: "bans", label: "Bannissements" },
  { id: "audit", label: "Journal d'audit" },
  { id: "danger", label: "Zone à risque" },
];

export default function ServerSettingsModal({ server, onClose, reload }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState({
    name: server.name,
    description: server.description,
    is_public: server.is_public,
    icon_url: server.icon_url || "",
    banner_url: server.banner_url || "",
  });
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
  // Bots
  const [bots, setBots] = useState([]);
  const [newBot, setNewBot] = useState({ name: "", description: "", avatar_url: "" });
  const [revealedTokens, setRevealedTokens] = useState({}); // {bot_id: true}
  // Auto-mod
  const [automod, setAutomod] = useState(null);
  const [automodWordsInput, setAutomodWordsInput] = useState("");
  // Roles editor
  const [members, setMembers] = useState([]);
  const [editingRoleId, setEditingRoleId] = useState(null); // null | "new" | role_id
  const [roleForm, setRoleForm] = useState({ name: "", color: "#FF3B00", permissions: 3, mentionable: true });
  const [memberFilter, setMemberFilter] = useState("");
  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const isOwner = server.owner_id === user?.user_id;

  useEffect(() => {
    if (tab === "invites") api.get(`/servers/${server.server_id}/invites`).then(r => setInvites(r.data)).catch(() => {});
    if (tab === "bans") api.get(`/servers/${server.server_id}/bans`).then(r => setBans(r.data)).catch(() => {});
    if (tab === "audit") api.get(`/servers/${server.server_id}/audit-log`).then(r => setAudit(r.data)).catch(() => {});
    if (tab === "emojis") api.get(`/servers/${server.server_id}/emojis`).then(r => setEmojis(r.data)).catch(() => {});
    if (tab === "webhooks") api.get(`/servers/${server.server_id}/webhooks`).then(r => setWebhooks(r.data)).catch(() => {});
    if (tab === "stats") api.get(`/servers/${server.server_id}/stats`).then(r => setStats(r.data)).catch(() => {});
    if (tab === "stickers") api.get(`/servers/${server.server_id}/stickers`).then(r => setStickers(r.data)).catch(() => {});
    if (tab === "bots") api.get(`/servers/${server.server_id}/bots`).then(r => setBots(r.data)).catch(() => {});
    if (tab === "automod") api.get(`/servers/${server.server_id}/automod`).then(r => {
      setAutomod(r.data);
      setAutomodWordsInput((r.data?.words || []).join(", "));
    }).catch(() => {});
    if (tab === "roles") api.get(`/servers/${server.server_id}/members`).then(r => setMembers(r.data)).catch(() => {});
  }, [tab, server.server_id]);

  const save = async () => {
    setSaving(true);
    try {
      // Only send fields that have content or changed (send null for empty to clear)
      const payload = {
        name: form.name,
        description: form.description || "",
        is_public: form.is_public,
      };
      if (form.icon_url !== (server.icon_url || "")) payload.icon_url = form.icon_url || null;
      if (form.banner_url !== (server.banner_url || "")) payload.banner_url = form.banner_url || null;
      await api.patch(`/servers/${server.server_id}`, payload);
      // Save tags
      const tags = tagsInput.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
      await api.patch(`/servers/${server.server_id}/tags`, { tags });
      toast.success("Enregistré"); reload();
    }
    catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Échec");
    }
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

  // ── Server icon/banner upload ──
  const uploadServerImage = async (e, field) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = data.url?.startsWith("http") ? data.url : `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
      setForm((p) => ({ ...p, [field]: url }));
      toast.success("Image téléversée — cliquez sur Enregistrer pour appliquer");
    } catch (_) { toast.error("Échec du téléversement"); }
    finally { e.target.value = ""; }
  };

  // ── Bots ──
  const createBot = async () => {
    if (!newBot.name || newBot.name.length < 2) { toast.error("Nom du bot requis (min 2 caractères)"); return; }
    try {
      const { data } = await api.post(`/servers/${server.server_id}/bots`, newBot);
      setBots([data, ...bots]);
      setRevealedTokens((p) => ({ ...p, [data.bot_id]: true }));
      setNewBot({ name: "", description: "", avatar_url: "" });
      toast.success(`Bot « ${data.name} » créé — copiez le token !`);
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : (Array.isArray(d) && d[0]?.msg) || "Échec");
    }
  };

  const uploadBotAvatar = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      const { data } = await api.post("/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = data.url?.startsWith("http") ? data.url : `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
      setNewBot((p) => ({ ...p, avatar_url: url }));
    } catch (_) { toast.error("Échec du téléversement"); }
    finally { e.target.value = ""; }
  };

  const regenBotToken = async (bot) => {
    if (!window.confirm(`Régénérer le token de « ${bot.name} » ? L'ancien cessera immédiatement de fonctionner.`)) return;
    try {
      const { data } = await api.post(`/servers/${server.server_id}/bots/${bot.bot_id}/regen`);
      setBots(bots.map(b => b.bot_id === bot.bot_id ? data : b));
      setRevealedTokens((p) => ({ ...p, [bot.bot_id]: true }));
      toast.success("Nouveau token généré");
    } catch (_) { toast.error("Échec"); }
  };

  const deleteBot = async (bot) => {
    if (!window.confirm(`Supprimer le bot « ${bot.name} » ?`)) return;
    try {
      await api.delete(`/servers/${server.server_id}/bots/${bot.bot_id}`);
      setBots(bots.filter(b => b.bot_id !== bot.bot_id));
      toast.success("Bot supprimé");
    } catch (_) { toast.error("Échec"); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié");
  };

  // ── Roles editor ──
  const PERM_DEFS = [
    { bit: 0,  key: "view",             label: "Voir le serveur",           desc: "Voir les salons et les membres." },
    { bit: 1,  key: "send",             label: "Envoyer des messages",      desc: "Écrire dans les salons texte." },
    { bit: 2,  key: "manage_messages",  label: "Gérer les messages",        desc: "Supprimer / épingler les messages, contourner l'auto-mod." },
    { bit: 3,  key: "manage_channels",  label: "Gérer les salons",          desc: "Créer, modifier, supprimer salons et catégories." },
    { bit: 4,  key: "manage_server",    label: "Gérer le serveur",          desc: "Modifier nom, tags, auto-mod, icône, stats." },
    { bit: 5,  key: "kick",             label: "Expulser des membres",      desc: "Retirer un membre du serveur." },
    { bit: 6,  key: "ban",              label: "Bannir des membres",        desc: "Interdire l'accès définitif au serveur." },
    { bit: 7,  key: "manage_roles",     label: "Gérer les rôles",           desc: "Créer / modifier les rôles et les assigner." },
    { bit: 8,  key: "mention_everyone", label: "Mentionner @everyone",      desc: "Ping tout le serveur via @everyone / @here." },
    { bit: 31, key: "administrator",    label: "Administrateur",            desc: "Active toutes les permissions et contourne les restrictions.", danger: true },
  ];
  const hasPerm = (perms, bit) => Math.floor((perms || 0) / Math.pow(2, bit)) % 2 === 1;
  const togglePerm = (perms, bit) => {
    const v = Math.pow(2, bit);
    return hasPerm(perms, bit) ? (perms - v) : (perms + v);
  };

  const openCreateRole = () => {
    setEditingRoleId("new");
    setRoleForm({ name: "Nouveau rôle", color: "#FF3B00", permissions: 3, mentionable: true });
  };
  const openEditRole = (r) => {
    setEditingRoleId(r.role_id);
    setRoleForm({
      name: r.name || "",
      color: r.color || "#FF3B00",
      permissions: r.permissions || 0,
      mentionable: r.mentionable !== false,
    });
    setMemberFilter("");
  };
  const cancelEditRole = () => setEditingRoleId(null);

  const saveRole = async () => {
    if (!roleForm.name.trim()) { toast.error("Nom requis"); return; }
    try {
      if (editingRoleId === "new") {
        await api.post(`/servers/${server.server_id}/roles`, roleForm);
        toast.success("Rôle créé");
      } else {
        await api.patch(`/servers/${server.server_id}/roles/${editingRoleId}`, roleForm);
        toast.success("Rôle enregistré");
      }
      setEditingRoleId(null);
      reload && reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec");
    }
  };

  const removeRole = async (r) => {
    if (r.is_default) { toast.error("Impossible de supprimer le rôle par défaut"); return; }
    if (!window.confirm(`Supprimer le rôle « ${r.name} » ?`)) return;
    try {
      await api.delete(`/servers/${server.server_id}/roles/${r.role_id}`);
      toast.success("Rôle supprimé");
      if (editingRoleId === r.role_id) setEditingRoleId(null);
      reload && reload();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec");
    }
  };

  const toggleMemberRole = async (member, roleId) => {
    const hasRole = (member.role_ids || []).includes(roleId);
    const newIds = hasRole
      ? member.role_ids.filter((id) => id !== roleId)
      : [...(member.role_ids || []), roleId];
    // optimistic
    setMembers((prev) => prev.map((m) => m.user_id === member.user_id ? { ...m, role_ids: newIds } : m));
    try {
      await api.patch(`/servers/${server.server_id}/members/${member.user_id}`, { role_ids: newIds });
    } catch (e) {
      // rollback
      setMembers((prev) => prev.map((m) => m.user_id === member.user_id ? { ...m, role_ids: member.role_ids || [] } : m));
      toast.error(e?.response?.data?.detail || "Échec");
    }
  };

  // ── Delete server (owner) ──
  const deleteServer = async () => {
    if (deleteConfirm !== server.name) {
      toast.error("Nom du serveur incorrect");
      return;
    }
    if (!window.confirm(`Supprimer définitivement « ${server.name} » ? Tous les salons, messages, rôles et membres seront effacés. Cette action est IRRÉVERSIBLE.`)) return;
    try {
      await api.delete(`/servers/${server.server_id}`);
      toast.success("Serveur supprimé");
      onClose();
      reload && reload();
      navigate("/app/me");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec de la suppression");
    }
  };

  return (
    <ModalShell title={`${server.name} · paramètres`} onClose={onClose} testId="server-settings-modal" wide>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 mt-2">
        <nav className="md:col-span-3 flex md:flex-col gap-1 md:space-y-1 md:border-r md:border-cc-border md:pr-3 overflow-x-auto md:overflow-visible scrollbar-thin pb-1 md:pb-0">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`server-tab-${t.id}`} className={`shrink-0 md:w-full text-left whitespace-nowrap md:whitespace-normal px-3 py-2 text-xs md:text-sm transition-colors ${tab === t.id ? "bg-cc-surface2 text-cc-text border-b-2 md:border-b-0 md:border-l-2 border-cc-accent md:border-l-cc-accent" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text"}`}>{t.label}</button>
          ))}
        </nav>
        <div className="md:col-span-9 max-h-[60vh] md:max-h-[65vh] overflow-y-auto min-w-0">
          {tab === "overview" && (
            <div className="space-y-5">
              {/* Icon & Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Icône du serveur</label>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="w-20 h-20 bg-cc-base border border-cc-border rounded-md overflow-hidden flex items-center justify-center font-display font-extrabold text-cc-muted shrink-0">
                      {form.icon_url ? <img src={form.icon_url} alt="icon" className="w-full h-full object-cover" /> : initials(form.name || "?")}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="bg-cc-accent text-white px-3 py-1.5 text-[11px] uppercase tracking-widest font-bold cursor-pointer cc-brutal-shadow cc-brutal-press inline-flex items-center gap-1.5" data-testid="server-upload-icon">
                        <Upload className="w-3.5 h-3.5" /> Téléverser
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadServerImage(e, "icon_url")} />
                      </label>
                      {form.icon_url && (
                        <button onClick={() => setForm((p) => ({ ...p, icon_url: "" }))} className="text-[10px] uppercase tracking-widest text-cc-muted hover:text-cc-danger font-bold">Retirer</button>
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Bannière</label>
                  <div className="mt-2">
                    <div className="w-full h-20 bg-cc-base border border-cc-border rounded-md overflow-hidden flex items-center justify-center">
                      {form.banner_url ? <img src={form.banner_url} alt="banner" className="w-full h-full object-cover" /> : <span className="text-cc-muted text-[10px] uppercase tracking-widest">Aucune bannière</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <label className="bg-cc-surface2 border border-cc-border px-3 py-1.5 text-[11px] uppercase tracking-widest font-bold cursor-pointer inline-flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" /> Téléverser
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadServerImage(e, "banner_url")} />
                      </label>
                      {form.banner_url && (
                        <button onClick={() => setForm((p) => ({ ...p, banner_url: "" }))} className="text-[10px] uppercase tracking-widest text-cc-muted hover:text-cc-danger font-bold">Retirer</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

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
              <button data-testid="server-edit-save" onClick={save} disabled={saving} className="bg-cc-accent text-white font-bold uppercase tracking-wide px-5 py-2.5 cc-brutal-shadow cc-brutal-press disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer"}</button>
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
              {editingRoleId === null ? (
                <>
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter">Rôles</h3>
                    <button onClick={openCreateRole} data-testid="role-create" className="bg-cc-accent text-white font-bold uppercase tracking-wide text-xs px-3 py-2 cc-brutal-shadow cc-brutal-press">+ Créer un rôle</button>
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-cc-muted mb-3">
                    Cliquez sur un rôle pour modifier son nom, sa couleur, ses permissions et les membres qui le portent.
                  </p>
                  <ul className="space-y-2">
                    {(server.roles || []).map((r) => {
                      const count = members.filter((m) => (m.role_ids || []).includes(r.role_id)).length;
                      const isAdminRole = hasPerm(r.permissions, 31);
                      return (
                        <li key={r.role_id} data-testid={`role-row-${r.role_id}`} className="border border-cc-border bg-cc-surface2 px-3 py-2 flex items-center gap-3">
                          <span className="w-3 h-3 rounded-sm shrink-0 border border-black/20" style={{ background: r.color }} />
                          <span className="font-display font-bold truncate" style={{ color: r.color }}>{r.name}</span>
                          {r.is_default && <span className="text-[9px] uppercase tracking-widest text-cc-muted shrink-0">par défaut</span>}
                          {isAdminRole && <span className="text-[9px] uppercase tracking-widest text-cc-accent shrink-0 font-bold">admin</span>}
                          <span className="text-[10px] uppercase tracking-widest text-cc-muted ml-2 shrink-0">{count} membre{count > 1 ? "s" : ""}</span>
                          <div className="ml-auto flex items-center gap-3 shrink-0">
                            <button onClick={() => openEditRole(r)} data-testid={`role-edit-${r.role_id}`} className="text-[10px] uppercase tracking-widest font-bold text-cc-accent hover:text-cc-text">Modifier</button>
                            {!r.is_default && <button onClick={() => removeRole(r)} data-testid={`role-delete-${r.role_id}`} className="text-[10px] uppercase tracking-widest font-bold text-cc-muted hover:text-cc-danger">Supprimer</button>}
                          </div>
                        </li>
                      );
                    })}
                    {(!server.roles || server.roles.length === 0) && (
                      <li className="text-cc-muted text-xs uppercase tracking-widest">Aucun rôle défini.</li>
                    )}
                  </ul>
                </>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter truncate">
                      {editingRoleId === "new" ? "Nouveau rôle" : `Modifier « ${roleForm.name || "rôle"} »`}
                    </h3>
                    <button onClick={cancelEditRole} data-testid="role-back" className="text-[10px] uppercase tracking-widest text-cc-muted hover:text-cc-text shrink-0">← Retour</button>
                  </div>

                  <div>
                    <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Nom</label>
                    <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} maxLength={64} className="mt-2 w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2" data-testid="role-edit-name" />
                  </div>

                  <div>
                    <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Couleur</label>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <input type="color" value={roleForm.color} onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })} className="w-12 h-10 bg-cc-base border border-cc-border cursor-pointer" data-testid="role-edit-color" />
                      <input value={roleForm.color} onChange={(e) => setRoleForm({ ...roleForm, color: e.target.value })} className="w-28 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 font-jetbrains text-xs uppercase" />
                      <div className="flex gap-1 flex-wrap">
                        {["#FF3B00", "#F59E0B", "#EAB308", "#10B981", "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899", "#64748B", "#FFFFFF"].map((c) => (
                          <button key={c} onClick={() => setRoleForm({ ...roleForm, color: c })} className="w-7 h-7 border border-cc-border hover:scale-110 transition-transform" style={{ background: c }} title={c} aria-label={`couleur ${c}`} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={roleForm.mentionable} onChange={(e) => setRoleForm({ ...roleForm, mentionable: e.target.checked })} className="accent-cc-accent w-4 h-4" data-testid="role-edit-mentionable" />
                    <span className="text-sm">Mentionnable — autoriser <span className="font-mono">@{(roleForm.name || "role").toLowerCase().replace(/\s+/g, "-")}</span></span>
                  </label>

                  <div>
                    <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase block mb-2">Permissions</label>
                    <div className="border border-cc-border bg-cc-surface2 divide-y divide-cc-border">
                      {PERM_DEFS.map((p) => {
                        const adminOn = hasPerm(roleForm.permissions, 31);
                        const checked = hasPerm(roleForm.permissions, p.bit);
                        const effectivelyOn = p.bit === 31 ? checked : (checked || adminOn);
                        const disabled = p.bit !== 31 && adminOn;
                        return (
                          <label key={p.key} className={`flex items-start gap-3 p-3 transition-colors ${p.danger ? "bg-cc-accent/10" : ""} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-cc-surface1"}`}>
                            <input type="checkbox" checked={effectivelyOn} disabled={disabled} onChange={() => setRoleForm({ ...roleForm, permissions: togglePerm(roleForm.permissions, p.bit) })} className="accent-cc-accent w-4 h-4 mt-0.5 shrink-0" data-testid={`role-perm-${p.key}`} />
                            <div className="min-w-0">
                              <div className={`text-sm font-bold ${p.danger ? "text-cc-accent uppercase tracking-wider" : ""}`}>{p.label}</div>
                              <div className="text-[10px] text-cc-muted mt-0.5">{p.desc}</div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {hasPerm(roleForm.permissions, 31) && (
                      <p className="text-[10px] uppercase tracking-widest text-cc-accent mt-2 font-bold">⚠ Administrateur activé — toutes les autres permissions sont implicitement accordées.</p>
                    )}
                  </div>

                  {editingRoleId !== "new" && (
                    <div>
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <label className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">
                          Membres ({members.filter((m) => (m.role_ids || []).includes(editingRoleId)).length})
                        </label>
                        <input value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} placeholder="Filtrer…" className="w-40 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-2 py-1 text-xs" data-testid="role-member-filter" />
                      </div>
                      <div className="border border-cc-border bg-cc-surface2 max-h-56 overflow-y-auto divide-y divide-cc-border">
                        {members
                          .filter((m) => {
                            if (!memberFilter) return true;
                            const q = memberFilter.toLowerCase();
                            return (m.nickname || "").toLowerCase().includes(q) || (m.user?.display_name || "").toLowerCase().includes(q) || (m.user?.email || "").toLowerCase().includes(q);
                          })
                          .map((m) => {
                            const has = (m.role_ids || []).includes(editingRoleId);
                            return (
                              <label key={m.user_id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-cc-surface1">
                                <input type="checkbox" checked={has} onChange={() => toggleMemberRole(m, editingRoleId)} className="accent-cc-accent w-4 h-4 shrink-0" data-testid={`role-member-${m.user_id}`} />
                                <div className="w-7 h-7 bg-cc-base border border-cc-border rounded-full overflow-hidden flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {m.user?.avatar_url ? <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(m.user?.display_name || "?")}
                                </div>
                                <span className="text-sm truncate flex-1">{m.nickname || m.user?.display_name || "—"}</span>
                                {server.owner_id === m.user_id && <span className="text-[9px] uppercase tracking-widest text-cc-accent shrink-0">propriétaire</span>}
                              </label>
                            );
                          })}
                        {members.length === 0 && <div className="p-3 text-xs text-cc-muted text-center uppercase tracking-widest">Aucun membre.</div>}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 flex-wrap">
                    <button onClick={saveRole} data-testid="role-save" className="bg-cc-accent text-white font-bold uppercase tracking-wide px-5 py-2.5 cc-brutal-shadow cc-brutal-press">
                      {editingRoleId === "new" ? "Créer le rôle" : "Enregistrer"}
                    </button>
                    <button onClick={cancelEditRole} className="bg-cc-surface2 border border-cc-border text-cc-text font-bold uppercase tracking-wide px-5 py-2.5 text-sm">Annuler</button>
                    {editingRoleId !== "new" && (() => {
                      const r = (server.roles || []).find((x) => x.role_id === editingRoleId);
                      if (r && !r.is_default) {
                        return (
                          <button onClick={() => removeRole(r)} className="ml-auto text-cc-danger hover:text-cc-accent font-bold uppercase tracking-wide text-xs px-3 py-2.5 border border-cc-danger/40">
                            Supprimer le rôle
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
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
          {tab === "bots" && (
            <div>
              <h3 className="font-display font-extrabold text-2xl uppercase tracking-tighter mb-1 flex items-center gap-2">
                <Bot className="w-6 h-6 text-cc-accent" /> Bots du serveur
              </h3>
              <p className="text-xs text-cc-subtext mb-4">
                Créez des bots pour automatiser votre serveur. Le token permet au bot de poster des messages via <span className="font-mono">POST /api/bots/message</span> avec l'entête <span className="font-mono">Authorization: Bot &lt;token&gt;</span>.
              </p>

              {isOwner ? (
                <div className="border border-cc-border bg-cc-surface2 p-3 mb-5 space-y-2">
                  <div className="text-[10px] tracking-[0.3em] font-bold text-cc-muted uppercase">Créer un nouveau bot</div>
                  <input
                    value={newBot.name}
                    onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                    placeholder="Nom du bot (ex: ModerationBot)"
                    className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 text-sm"
                    maxLength={32}
                    data-testid="bot-name-input"
                  />
                  <div className="flex gap-2 items-center">
                    <input
                      value={newBot.avatar_url}
                      onChange={(e) => setNewBot({ ...newBot, avatar_url: e.target.value })}
                      placeholder="URL de l'avatar (optionnel)"
                      className="flex-1 bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 font-jetbrains text-xs"
                    />
                    <label className="bg-cc-surface2 border border-cc-border px-3 py-2 text-xs uppercase tracking-widest font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                      <Upload className="w-3 h-3" /> Image
                      <input type="file" accept="image/*" className="hidden" onChange={uploadBotAvatar} />
                    </label>
                  </div>
                  <textarea
                    value={newBot.description}
                    onChange={(e) => setNewBot({ ...newBot, description: e.target.value })}
                    placeholder="Description (optionnel)"
                    rows={2}
                    maxLength={300}
                    className="w-full bg-cc-base border border-cc-border focus:border-cc-accent outline-none px-3 py-2 text-sm"
                  />
                  <button
                    onClick={createBot}
                    data-testid="bot-create"
                    className="bg-cc-accent text-white font-bold uppercase tracking-wide px-4 py-2 cc-brutal-shadow cc-brutal-press text-xs inline-flex items-center gap-2"
                  >
                    <Bot className="w-3.5 h-3.5" /> Créer le bot
                  </button>
                </div>
              ) : (
                <div className="border border-cc-border bg-cc-surface2 p-3 mb-4 text-xs text-cc-muted uppercase tracking-widest">
                  Seul le propriétaire peut créer ou gérer les bots.
                </div>
              )}

              <ul className="space-y-2">
                {bots.map((b) => {
                  const revealed = revealedTokens[b.bot_id];
                  return (
                    <li key={b.bot_id} className="border border-cc-border bg-cc-surface2 p-3" data-testid={`bot-${b.bot_id}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-cc-base border border-cc-border rounded-md overflow-hidden flex items-center justify-center shrink-0">
                          {b.avatar_url ? <img src={b.avatar_url} alt="" className="w-full h-full object-cover" /> : <Bot className="w-5 h-5 text-cc-muted" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-display font-bold flex items-center gap-2 flex-wrap">
                            {b.name}
                            <span className="text-[9px] uppercase tracking-widest bg-cc-accent/20 text-cc-accent px-1.5 py-0.5 rounded">BOT</span>
                          </div>
                          {b.description && <div className="text-xs text-cc-subtext mt-0.5 truncate">{b.description}</div>}
                        </div>
                        {isOwner && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => regenBotToken(b)} className="p-1.5 text-cc-muted hover:text-cc-accent" title="Régénérer le token"><RefreshCw className="w-4 h-4" /></button>
                            <button onClick={() => deleteBot(b)} className="p-1.5 text-cc-muted hover:text-cc-danger" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                      {b.token && (
                        <div className="mt-3 bg-cc-base border border-cc-border rounded p-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-widest text-cc-muted shrink-0">Token</span>
                            <code className="flex-1 font-mono text-xs break-all text-cc-subtext min-w-0">
                              {revealed ? b.token : "•".repeat(Math.min(40, b.token.length))}
                            </code>
                            <button
                              onClick={() => setRevealedTokens((p) => ({ ...p, [b.bot_id]: !revealed }))}
                              className="p-1 text-cc-muted hover:text-cc-text shrink-0"
                              title={revealed ? "Masquer" : "Afficher"}
                            >
                              {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => copyToClipboard(b.token)} className="p-1 text-cc-muted hover:text-cc-accent shrink-0" title="Copier">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="text-[10px] text-cc-muted mt-1.5 uppercase tracking-widest">⚠ Gardez ce token secret. Utilisez-le comme header : <span className="font-mono normal-case tracking-normal">Bot {revealed ? b.token.slice(0, 8) + "…" : "<token>"}</span></div>
                        </div>
                      )}
                    </li>
                  );
                })}
                {bots.length === 0 && <li className="text-cc-muted text-xs uppercase tracking-widest">Aucun bot. {isOwner && "Créez-en un ci-dessus."}</li>}
              </ul>
            </div>
          )}
          {tab === "automod" && (
            <div className="space-y-4 max-w-2xl">
              <p className="text-xs text-cc-muted uppercase tracking-widest">Filtre regex/mots-clés appliqué à tous les nouveaux messages. Les rôles avec <strong>Gérer les messages</strong> sont exemptés.</p>
              {!automod ? (
                <div className="text-cc-muted text-xs">Chargement…</div>
              ) : (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!automod.enabled} onChange={(e) => setAutomod({ ...automod, enabled: e.target.checked })} />
                    <span className="text-sm font-bold uppercase tracking-widest">Activer l'auto-modération</span>
                  </label>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-cc-muted block mb-1">Action sur violation</label>
                    <select value={automod.action} onChange={(e) => setAutomod({ ...automod, action: e.target.value })} className="bg-cc-surface2 border border-cc-border px-3 py-2 text-sm">
                      <option value="warn">Avertissement (laisse passer)</option>
                      <option value="delete">Bloquer le message</option>
                      <option value="timeout">Bloquer + timeout l'auteur</option>
                    </select>
                  </div>
                  {automod.action === "timeout" && (
                    <div>
                      <label className="text-xs uppercase tracking-widest text-cc-muted block mb-1">Durée du timeout (minutes)</label>
                      <input type="number" min={1} max={10080} value={automod.timeout_minutes || 10} onChange={(e) => setAutomod({ ...automod, timeout_minutes: Math.max(1, parseInt(e.target.value || "10", 10)) })} className="bg-cc-surface2 border border-cc-border px-3 py-2 text-sm w-32" />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!automod.block_invites} onChange={(e) => setAutomod({ ...automod, block_invites: e.target.checked })} />
                    <span className="text-sm">Bloquer les liens d'invitation (Discord, CentCord)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!automod.block_links} onChange={(e) => setAutomod({ ...automod, block_links: e.target.checked })} />
                    <span className="text-sm">Bloquer tous les liens http(s)</span>
                  </label>
                  <div>
                    <label className="text-xs uppercase tracking-widest text-cc-muted block mb-1">Mots/phrases interdits (séparés par virgules, max 200)</label>
                    <textarea
                      value={automodWordsInput}
                      onChange={(e) => setAutomodWordsInput(e.target.value)}
                      placeholder="ex: spam, arnaque, mot-honteux"
                      rows={4}
                      className="w-full bg-cc-surface2 border border-cc-border px-3 py-2 text-sm font-jetbrains"
                    />
                    <div className="text-[10px] text-cc-muted mt-1 uppercase tracking-widest">Insensible à la casse · sous-chaîne</div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-cc-border">
                    <button
                      onClick={async () => {
                        const words = automodWordsInput.split(",").map((w) => w.trim()).filter(Boolean);
                        try {
                          const { data } = await api.put(`/servers/${server.server_id}/automod`, { ...automod, words });
                          setAutomod(data);
                          setAutomodWordsInput((data.words || []).join(", "));
                          toast.success("Auto-mod enregistrée");
                        } catch (e) { toast.error("Échec de l'enregistrement"); }
                      }}
                      className="bg-cc-accent text-white px-4 py-2 text-xs font-bold uppercase tracking-widest cc-brutal-shadow cc-brutal-press"
                    >Enregistrer</button>
                  </div>
                </>
              )}
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
              {!isOwner && (
                <>
                  <div className="border border-cc-border bg-cc-surface2 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldAlert className="w-4 h-4 text-cc-accent" />
                      <h3 className="font-display font-bold uppercase tracking-tight">Membre</h3>
                    </div>
                    <p className="text-cc-subtext text-xs leading-relaxed">
                      Vous pouvez quitter ce serveur à tout moment.
                    </p>
                  </div>
                  <button onClick={leaveServer} data-testid="leave-server" className="w-full border border-cc-danger text-cc-danger uppercase tracking-widest font-bold py-3 hover:bg-cc-danger hover:text-white transition-colors">
                    Quitter le serveur
                  </button>
                </>
              )}
              {isOwner && (
                <>
                  <div className="border border-cc-border bg-cc-surface2 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Archive className="w-4 h-4 text-cc-accent" />
                      <h3 className="font-display font-bold uppercase tracking-tight">Archiver</h3>
                    </div>
                    <p className="text-cc-subtext text-xs leading-relaxed">
                      Mettre le serveur en lecture seule et le masquer. Les données restent intactes.
                    </p>
                    <button onClick={archive} data-testid="archive-server" className="mt-3 border border-cc-border text-cc-text uppercase tracking-widest font-bold py-2 px-4 hover:bg-cc-surface1 transition-colors inline-flex items-center gap-2 text-xs">
                      <Archive className="w-3.5 h-3.5" /> Archiver
                    </button>
                  </div>

                  <div className="border border-cc-danger/60 bg-cc-danger/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Trash2 className="w-4 h-4 text-cc-danger" />
                      <h3 className="font-display font-bold uppercase tracking-tight text-cc-danger">Supprimer le serveur</h3>
                    </div>
                    <p className="text-cc-subtext text-xs leading-relaxed mb-3">
                      Suppression <strong>définitive et irréversible</strong> : salons, messages, rôles, membres, invitations, bots — tout sera effacé.
                      Pour confirmer, tapez le nom exact du serveur : <span className="font-mono text-cc-text">{server.name}</span>
                    </p>
                    <input
                      value={deleteConfirm}
                      onChange={(e) => setDeleteConfirm(e.target.value)}
                      placeholder={server.name}
                      className="w-full bg-cc-base border border-cc-border focus:border-cc-danger outline-none px-3 py-2 text-sm font-mono"
                      data-testid="delete-server-confirm"
                    />
                    <button
                      onClick={deleteServer}
                      disabled={deleteConfirm !== server.name}
                      data-testid="delete-server"
                      className="mt-3 w-full bg-cc-danger text-white uppercase tracking-widest font-bold py-2.5 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-red-600 transition-colors inline-flex items-center justify-center gap-2 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer définitivement
                    </button>
                  </div>
                </>
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
