import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import { useMobile } from "../lib/mobile";
import UserBar from "./UserBar";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import MembersSidebar from "./MembersSidebar";
import NotificationsPanel from "./NotificationsPanel";
import ServerSettingsModal from "./modals/ServerSettingsModal";
import CreateChannelModal from "./modals/CreateChannelModal";
import PinModal from "./PinModal";
import SearchModal from "./SearchModal";
import ThreadPanel from "./ThreadPanel";
import VoiceRoom from "./VoiceRoom";
import UserProfilePopover from "./UserProfilePopover";
import SortableChannelList from "./SortableChannelList";
import { Hash, Volume2, Megaphone, BookOpen, ChevronDown, ChevronRight, Plus, Settings, Users, Pin, Search, Menu, X as XIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const channelIcon = (type) => ({
  text: Hash, voice: Volume2, announcement: Megaphone, forum: BookOpen,
}[type] || Hash);

export default function ServerView({ servers, reload }) {
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ws = useWS();
  const { isMobile, drawerOpen, toggleDrawer, closeDrawer } = useMobile();
  const [server, setServer] = useState(null);
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 768 : true));
  const [collapsedCats, setCollapsedCats] = useState({});
  const [openSettings, setOpenSettings] = useState(false);
  const [openCreateChannel, setOpenCreateChannel] = useState(null); // null | { categoryId }
  const [openPins, setOpenPins] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [activeThread, setActiveThread] = useState(null); // { thread, parent }
  const [customEmojis, setCustomEmojis] = useState([]);
  const [unread, setUnread] = useState({}); // { channel_id: count }
  const [profileUserId, setProfileUserId] = useState(null);
  const [voicePresence, setVoicePresence] = useState({}); // { channel_id: [participants] }
  const [channelMenu, setChannelMenu] = useState(null); // { channel, x, y } | null
  const [editingTopic, setEditingTopic] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  // Ref to always have the latest active channel_id inside WS callbacks (avoids stale closures)
  const activeChannelIdRef = React.useRef(null);
  React.useEffect(() => { activeChannelIdRef.current = channel?.channel_id || null; }, [channel?.channel_id]);

  // Compute role color for any member (highest-position role with a non-default color)
  const memberColorMap = React.useMemo(() => {
    if (!server?.roles || !members?.length) return {};
    const roles = [...(server.roles || [])].sort((a, b) => (b.position || 0) - (a.position || 0));
    const map = {};
    for (const m of members) {
      const ridSet = new Set(m.role_ids || []);
      for (const r of roles) {
        if (ridSet.has(r.role_id) && r.color && r.color !== "#99AAB5" && r.color !== "#000000") {
          map[m.user_id] = r.color;
          break;
        }
      }
    }
    return map;
  }, [server, members]);

  const loadVoicePresence = useCallback(async () => {
    try { const { data } = await api.get(`/servers/${serverId}/voice-participants`); setVoicePresence(data || {}); } catch (_) {}
  }, [serverId]);

  const loadUnread = useCallback(async () => {
    try { const { data } = await api.get(`/channels/unread`); setUnread(data || {}); } catch (_) {}
  }, []);

  const markRead = useCallback(async (cid) => {
    if (!cid) return;
    try { await api.post(`/channels/${cid}/read`, {}); } catch (_) {}
    setUnread((u) => { const n = { ...u }; delete n[cid]; return n; });
  }, []);

  const loadServer = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${serverId}`);
      setServer(data);
      const firstText = (data.channels || []).find((c) => c.type === "text");
      const targetChannel = (data.channels || []).find((c) => c.channel_id === channelId) || firstText || data.channels[0];
      if (targetChannel) {
        setChannel(targetChannel);
        if (!channelId && targetChannel) navigate(`/app/servers/${serverId}/channels/${targetChannel.channel_id}`, { replace: true });
      }
    } catch (e) { toast.error("Échec du chargement du serveur"); }
  }, [serverId, channelId, navigate]);

  const loadMembers = useCallback(async () => {
    try { const { data } = await api.get(`/servers/${serverId}/members`); setMembers(data); } catch (_) {}
  }, [serverId]);

  const loadMessages = useCallback(async (cid) => {
    if (!cid) return;
    try { const { data } = await api.get(`/channels/${cid}/messages?limit=50`); setMessages(data); } catch (_) {}
  }, []);

  const loadEmojis = useCallback(async () => {
    try { const { data } = await api.get(`/servers/${serverId}/emojis`); setCustomEmojis(data || []); } catch (_) {}
  }, [serverId]);

  useEffect(() => { loadServer(); loadMembers(); loadEmojis(); loadUnread(); loadVoicePresence(); }, [loadServer, loadMembers, loadEmojis, loadUnread, loadVoicePresence]);
  // Clear messages immediately on channel switch to avoid bleeding old channel content into the new view
  useEffect(() => {
    setMessages([]);
    if (channel?.channel_id && channel.type === "text") {
      loadMessages(channel.channel_id);
      markRead(channel.channel_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.channel_id, channel?.type]);
  useEffect(() => { setReplyTo(null); setActiveThread(null); }, [channel?.channel_id]);

  useEffect(() => {
    if (!ws) return;
    const offC = ws.subscribe("message.create", (m) => {
      const activeId = activeChannelIdRef.current;
      if (m.channel_id === activeId && !m.thread_id) {
        setMessages((prev) => {
          // Avoid duplicates if backend echoes back our own POST result + WS event
          if (prev.some((x) => x.message_id === m.message_id)) return prev;
          return [...prev, m];
        });
        markRead(m.channel_id);
      } else if (m.channel_id && m.author_id !== user?.user_id) {
        setUnread((u) => ({ ...u, [m.channel_id]: (u[m.channel_id] || 0) + 1 }));
      }
    });
    const offU = ws.subscribe("message.update", (d) => setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, content: d.content, edited_at: d.edited_at } : m)));
    const offD = ws.subscribe("message.delete", (d) => setMessages((prev) => prev.filter((m) => m.message_id !== d.message_id)));
    const offR = ws.subscribe("message.reaction", (d) => setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, reactions: d.reactions } : m)));
    const offChCreate = ws.subscribe("channel.create", () => loadServer());
    const offChReorder = ws.subscribe("channel.reorder", () => loadServer());
    const offCatReorder = ws.subscribe("category.reorder", () => loadServer());
    const offChDel = ws.subscribe("channel.delete", (d) => {
      // If the active channel was deleted, navigate away
      if (d?.channel_id && d.channel_id === activeChannelIdRef.current) {
        navigate(`/app/servers/${serverId}`);
      }
      loadServer();
    });
    const offChUpdate = ws.subscribe("channel.update", () => loadServer());
    const offCatCreate = ws.subscribe("category.create", () => loadServer());
    const offCatDel = ws.subscribe("category.delete", () => loadServer());
    const offCatUpdate = ws.subscribe("category.update", () => loadServer());
    const offRoleCreate = ws.subscribe("role.create", () => { loadServer(); loadMembers(); });
    const offRoleUpdate = ws.subscribe("role.update", () => { loadServer(); loadMembers(); });
    const offRoleDel = ws.subscribe("role.delete", () => { loadServer(); loadMembers(); });
    const offMember = ws.subscribe("member.join", () => loadMembers());
    const offMemberUpdate = ws.subscribe("member.update", () => loadMembers());
    const offMemberKick = ws.subscribe("member.kick", () => loadMembers());
    const offMemberBan = ws.subscribe("member.ban", () => loadMembers());
    const offSrvUpdate = ws.subscribe("server.update", () => loadServer());
    const offEmCreate = ws.subscribe("emoji.create", () => loadEmojis());
    const offEmDel = ws.subscribe("emoji.delete", () => loadEmojis());
    const offVoice = ws.subscribe("voice.presence", (p) => {
      if (!p?.channel_id) return;
      setVoicePresence((v) => ({ ...v, [p.channel_id]: p.participants || [] }));
    });
    const offThread = ws.subscribe("thread.create", (t) => {
      // Mark parent message as having a thread
      setMessages((prev) => prev.map((m) => m.message_id === t.parent_message_id ? { ...m, thread_id: t.thread_id } : m));
    });
    return () => {
      offC(); offU(); offD(); offR();
      offChCreate(); offChDel(); offChUpdate();
      offChReorder(); offCatReorder();
      offCatCreate(); offCatDel(); offCatUpdate();
      offRoleCreate(); offRoleUpdate(); offRoleDel();
      offMember(); offMemberUpdate(); offMemberKick(); offMemberBan();
      offSrvUpdate();
      offEmCreate(); offEmDel();
      offVoice();
      offThread();
    };
    // Subscribe ONCE per server (not per channel) - we use activeChannelIdRef for the latest channel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, serverId]);

  if (!server) {
    return (
      <main className="flex-1 flex bg-cc-surface2">
        {/* Skeleton sidebar */}
        <aside className="w-60 bg-cc-surface1 border-r border-cc-border hidden md:flex flex-col">
          <div className="h-12 border-b border-cc-border" />
          <div className="flex-1 overflow-y-auto">
            <div className="cc-skeleton mx-3 mt-3" style={{ width: "60%", height: 14 }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cc-skeleton mx-3 mt-2" style={{ width: `${50 + ((i*13)%40)}%`, height: 18 }} />
            ))}
          </div>
        </aside>
        <div className="flex-1 flex flex-col">
          <div className="h-12 border-b border-cc-border flex items-center px-4">
            <div className="cc-skeleton" style={{ width: "30%", height: 16 }} />
          </div>
          <div className="flex-1 overflow-y-auto py-4">
            <div className="flex flex-col gap-4 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="cc-skeleton rounded-sm" style={{ width: 36, height: 36 }} />
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="cc-skeleton" style={{ width: `${30 + ((i*7)%30)}%`, height: 12 }} />
                    <div className="cc-skeleton" style={{ width: `${50 + ((i*11)%40)}%`, height: 14 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const customEmojiMap = customEmojis.reduce((acc, e) => { acc[e.name] = e.image_url; return acc; }, {});

  const channelsByCat = {};
  for (const c of server.channels || []) {
    const k = c.category_id || "_uncat";
    channelsByCat[k] = channelsByCat[k] || [];
    channelsByCat[k].push(c);
  }
  // Sort channels by position within each category
  for (const k of Object.keys(channelsByCat)) {
    channelsByCat[k].sort((a, b) => (a.position || 0) - (b.position || 0));
  }
  const cats = [...(server.categories || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
  const Icon = channelIcon(channel?.type);

  // Reorder channels within a category
  const reorderChannels = async (categoryIdOrNull, orderedIds) => {
    const items = orderedIds.map((channel_id, idx) => ({
      channel_id,
      position: idx,
      category_id: categoryIdOrNull || null,
    }));
    try {
      await api.post(`/servers/${serverId}/channels/reorder`, { items });
      loadServer();
    } catch (_) { toast.error("Échec du réordonnancement"); }
  };

  // Move a single channel to another category
  const moveChannelToCategory = async (ch, targetCategoryId) => {
    setChannelMenu(null);
    const target = targetCategoryId === "_uncat" ? null : targetCategoryId;
    if ((ch.category_id || null) === target) return;
    // Place at the end of the target category
    const destList = channelsByCat[target || "_uncat"] || [];
    const newPos = destList.length;
    try {
      await api.post(`/servers/${serverId}/channels/reorder`, {
        items: [{ channel_id: ch.channel_id, position: newPos, category_id: target }],
      });
      toast.success("Salon déplacé");
      loadServer();
    } catch (_) { toast.error("Échec du déplacement"); }
  };

  const sendMsg = async (content, attachments, reply_to) => {
    if (!channel) return;
    const targetChannelId = channel.channel_id;
    try {
      const { data } = await api.post(`/channels/${targetChannelId}/messages`, { content, attachments, reply_to });
      // Optimistically append (dedup against WS event)
      if (data && data.message_id && targetChannelId === activeChannelIdRef.current) {
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === data.message_id)) return prev;
          return [...prev, data];
        });
      }
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Échec de l'envoi");
    }
  };

  const createChannel = (categoryId = null) => {
    setOpenCreateChannel({ categoryId });
  };

  const goToChannel = (cid) => {
    navigate(`/app/servers/${serverId}/channels/${cid}`);
    if (isMobile) closeDrawer();
  };

  const openChannelMenu = (e, ch) => {
    e.preventDefault();
    e.stopPropagation();
    setChannelMenu({ channel: ch, x: e.clientX, y: e.clientY });
  };

  const renameChannel = async (ch) => {
    setChannelMenu(null);
    const name = window.prompt("Nouveau nom du salon", ch.name);
    if (!name || name === ch.name) return;
    try {
      await api.patch(`/servers/${serverId}/channels/${ch.channel_id}`, { name });
      toast.success("Salon renommé");
      loadServer();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const deleteChannel = async (ch) => {
    setChannelMenu(null);
    if (!window.confirm(`Supprimer définitivement le salon « #${ch.name} » et tous ses messages ?`)) return;
    try {
      await api.delete(`/servers/${serverId}/channels/${ch.channel_id}`);
      toast.success("Salon supprimé");
      // If we deleted the active channel, navigate away
      if (ch.channel_id === channel?.channel_id) {
        navigate(`/app/servers/${serverId}`);
      }
      loadServer();
    } catch (e) { toast.error(e?.response?.data?.detail || "Échec"); }
  };

  const handleCreateThread = async (parentMsg) => {
    const name = prompt("Nom du fil ?", parentMsg.content?.slice(0, 50) || "Discussion");
    if (!name) return;
    try {
      const { data } = await api.post(`/channels/${parentMsg.channel_id}/threads`, { name, parent_message_id: parentMsg.message_id });
      toast.success("Fil créé");
      setActiveThread({ thread: data, parent: parentMsg });
    } catch (_) { toast.error("Échec"); }
  };

  const startEditTopic = () => {
    if (!channel) return;
    setTopicDraft(channel.topic || "");
    setEditingTopic(true);
  };

  const saveTopic = async () => {
    if (!channel) { setEditingTopic(false); return; }
    const next = (topicDraft || "").trim().slice(0, 400);
    if (next === (channel.topic || "")) { setEditingTopic(false); return; }
    try {
      await api.patch(`/servers/${serverId}/channels/${channel.channel_id}`, { topic: next });
      toast.success("Sujet mis à jour");
      loadServer();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Échec");
    } finally { setEditingTopic(false); }
  };

  // Render a single channel row (used by SortableChannelList)
  const renderChannelRow = (c, dragMeta) => {
    const Ic = channelIcon(c.type);
    const active = c.channel_id === channel?.channel_id;
    const unreadCount = unread[c.channel_id] || 0;
    const vps = voicePresence[c.channel_id] || [];
    return (
      <div className="relative">
        <button
          onClick={() => goToChannel(c.channel_id)}
          onContextMenu={(e) => openChannelMenu(e, c)}
          data-testid={`channel-${c.channel_id}`}
          className={cn(
            "w-full flex items-center gap-2 pl-1 pr-3 py-1.5 text-sm transition-colors rounded",
            active ? "bg-cc-surface2 text-cc-text" : (unreadCount > 0 ? "text-cc-text font-bold hover:bg-cc-surface2" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text")
          )}
        >
          {dragMeta?.handle || <span className="w-4 shrink-0" />}
          <Ic className="w-4 h-4 text-cc-muted shrink-0" />
          <span className="truncate flex-1 text-left">{c.name}</span>
          {c.type === "voice" && vps.length > 0 && (
            <span className="shrink-0 text-[10px] font-bold bg-cc-success/30 text-cc-success px-1.5 py-0.5 rounded-full" data-testid={`voice-count-${c.channel_id}`}>
              {vps.length}
            </span>
          )}
          {unreadCount > 0 && !active && (
            <span className="shrink-0 text-[10px] font-bold bg-cc-accent text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center" data-testid={`unread-${c.channel_id}`}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        {c.type === "voice" && vps.length > 0 && (
          <ul className="ml-7 mt-0.5 space-y-0.5" data-testid={`voice-participants-${c.channel_id}`}>
            {vps.map((p) => (
              <li key={p.user_id} className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text cursor-pointer" onClick={() => setProfileUserId(p.user_id)}>
                <span className="w-1.5 h-1.5 rounded-full bg-cc-success animate-pulse" />
                <span className="truncate" style={{ color: memberColorMap[p.user_id] || undefined }}>{p.display_name || "Membre"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={cn(
          "w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0 transition-transform duration-300 ease-out",
          // Mobile: drawer sitting next to the ServerRail (w-20)
          isMobile ? "fixed inset-y-0 left-20 z-40 h-[100dvh]" : "",
          isMobile && !drawerOpen ? "-translate-x-[calc(100%+5rem)]" : "translate-x-0"
        )}
      >
        <button data-testid="server-header" onClick={() => setOpenSettings(true)} className="h-12 border-b border-cc-border px-4 flex items-center justify-between hover:bg-cc-surface2 transition-colors">
          <span className="font-display font-extrabold uppercase tracking-tighter text-sm truncate">{server.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <Plus onClick={(e) => { e.stopPropagation(); createChannel(null); }} className="w-4 h-4 text-cc-muted hover:text-cc-accent" />
            <ChevronDown className="w-4 h-4 text-cc-muted" />
          </div>
        </button>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
          {cats.map((cat) => {
            const list = channelsByCat[cat.category_id] || [];
            const collapsed = collapsedCats[cat.category_id];
            return (
              <div key={cat.category_id}>
                <button onClick={() => setCollapsedCats({ ...collapsedCats, [cat.category_id]: !collapsed })} className="w-full px-2 flex items-center justify-between text-[10px] uppercase tracking-[0.25em] font-bold text-cc-muted hover:text-cc-text">
                  <span className="flex items-center gap-1">{collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} {cat.name}</span>
                  <Plus onClick={(e) => { e.stopPropagation(); createChannel(cat.category_id); }} className="w-3 h-3 hover:text-cc-accent" />
                </button>
                {!collapsed && (
                  <div className="mt-1 space-y-0.5">
                    <SortableChannelList
                      items={list}
                      onReorder={(orderedIds) => reorderChannels(cat.category_id, orderedIds)}
                      renderItem={renderChannelRow}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {(channelsByCat["_uncat"] || []).length > 0 && (
            <div className="space-y-0.5">
              <SortableChannelList
                items={channelsByCat["_uncat"]}
                onReorder={(orderedIds) => reorderChannels(null, orderedIds)}
                renderItem={renderChannelRow}
              />
            </div>
          )}
        </div>
        <div className="mt-auto"><UserBar /></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-cc-border px-2 sm:px-4 flex items-center gap-2 sm:gap-3">
          {isMobile && (
            <button
              onClick={toggleDrawer}
              aria-label="Menu"
              data-testid="mobile-menu-toggle"
              className="p-2 -ml-1 text-cc-subtext hover:text-cc-text"
            >
              {drawerOpen ? <XIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <Icon className="w-4 h-4 text-cc-muted shrink-0" />
          <span className="font-display font-bold uppercase tracking-tight text-sm truncate" data-testid="channel-name">{channel?.name || "—"}</span>
          {channel && (
            <>
              <div className="w-px h-5 bg-cc-border hidden sm:block" />
              {editingTopic ? (
                <input
                  autoFocus
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onBlur={saveTopic}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTopic();
                    if (e.key === "Escape") setEditingTopic(false);
                  }}
                  maxLength={400}
                  data-testid="topic-input"
                  className="bg-cc-base border border-cc-accent text-xs px-2 py-1 outline-none flex-1 min-w-0 max-w-md hidden sm:inline-block"
                  placeholder="Sujet du salon"
                />
              ) : (
                <button
                  onClick={startEditTopic}
                  data-testid="topic-display"
                  className="text-cc-subtext text-xs truncate hidden sm:inline-block hover:text-cc-text transition-colors text-left"
                  title="Cliquez pour modifier le sujet"
                >
                  {channel.topic || <span className="italic text-cc-muted">Cliquez pour ajouter un sujet…</span>}
                </button>
              )}
            </>
          )}
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button onClick={() => setOpenPins(true)} data-testid="header-pins" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text hidden sm:inline-flex" title="Épinglés"><Pin className="w-4 h-4" /></button>
            <button data-testid="header-toggle-members" onClick={() => setShowMembers(!showMembers)} className={cn("p-2 hover:bg-cc-surface2 transition-colors", showMembers ? "text-cc-text" : "text-cc-subtext")} title="Membres"><Users className="w-4 h-4" /></button>
            <button onClick={() => setOpenSearch(true)} data-testid="header-search" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text" title="Rechercher"><Search className="w-4 h-4" /></button>
            <NotificationsPanel />
            <button data-testid="header-settings" onClick={() => setOpenSettings(true)} className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text" title="Paramètres"><Settings className="w-4 h-4" /></button>
          </div>
        </header>
        {channel?.type === "voice" ? (
          <VoiceRoom channel={channel} server={server} />
        ) : (
          <>
            {channel?.type === "announcement" && (
              <div className="mx-3 mt-3 px-4 py-2 cc-card flex items-center gap-3 text-sm">
                <Megaphone className="w-4 h-4 text-cc-accent shrink-0" />
                <span className="text-cc-text font-bold">Salon d'annonces</span>
                <span className="text-cc-muted text-xs">— seuls les administrateurs peuvent y publier.</span>
              </div>
            )}
            {channel?.type === "forum" && (
              <div className="mx-3 mt-3 px-4 py-2 cc-card flex items-center gap-3 text-sm">
                <BookOpen className="w-4 h-4 text-cc-accent shrink-0" />
                <span className="text-cc-text font-bold">Forum</span>
                <span className="text-cc-muted text-xs">— créez des fils de discussion (clic-droit sur un message → Créer un fil).</span>
              </div>
            )}
            <MessageList
              messages={messages}
              currentUser={user}
              onReact={(id, e) => api.post(`/messages/${id}/reactions`, { emoji: e })}
              onReply={(m) => setReplyTo(m)}
              onCreateThread={handleCreateThread}
              onOpenThread={(t, parent) => setActiveThread({ thread: t, parent })}
              onOpenProfile={(uid) => uid && setProfileUserId(uid)}
              memberColorMap={memberColorMap}
              customEmojiMap={customEmojiMap}
            />
            {channel?.type === "announcement" && server.owner_id !== user?.user_id && user?.role !== "admin" ? (
              <div className="px-4 py-3 mx-3 mb-3 cc-card text-center text-xs text-cc-muted italic">
                Vous n'avez pas la permission de publier dans ce salon d'annonces.
              </div>
            ) : (
              <MessageComposer
                placeholder={
                  channel?.type === "announcement" ? `Annonce dans #${channel?.name || ""}` :
                  channel?.type === "forum" ? `Nouveau post dans #${channel?.name || ""}` :
                  `Message #${channel?.name || ""}`
                }
                onSend={sendMsg}
                testIdPrefix="ch"
                serverId={serverId}
                channelId={channel?.channel_id}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            )}
          </>
        )}
      </main>

      {activeThread && <ThreadPanel thread={activeThread.thread} parentMessage={activeThread.parent} onClose={() => setActiveThread(null)} />}
      {showMembers && !activeThread && <MembersSidebar members={members} server={server} reload={loadMembers} />}
      {openSettings && <ServerSettingsModal server={server} reload={() => { loadServer(); reload && reload(); }} onClose={() => setOpenSettings(false)} />}
      {openCreateChannel && <CreateChannelModal serverId={serverId} categories={server.categories || []} defaultCategoryId={openCreateChannel.categoryId} voiceChannelExists={(server.channels || []).some(c => c.type === "voice")} onClose={() => setOpenCreateChannel(null)} onCreated={() => loadServer()} />}
      {openPins && channel && <PinModal channelId={channel.channel_id} onClose={() => setOpenPins(false)} />}
      {openSearch && <SearchModal serverId={serverId} onClose={() => setOpenSearch(false)} />}
      {profileUserId && <UserProfilePopover userId={profileUserId} onClose={() => setProfileUserId(null)} />}

      {/* Channel context menu (right-click on channel) */}
      {channelMenu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setChannelMenu(null)} onContextMenu={(e) => { e.preventDefault(); setChannelMenu(null); }} />
          <div
            className="fixed z-[61] bg-cc-surface1 border border-cc-border shadow-lg min-w-[200px] py-1"
            style={{
              left: Math.min(channelMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1000) - 220),
              top: Math.min(channelMenu.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 320),
            }}
            data-testid="channel-context-menu"
          >
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold text-cc-muted truncate">#{channelMenu.channel.name}</div>
            <button
              onClick={() => renameChannel(channelMenu.channel)}
              className="w-full text-left px-3 py-2 text-sm text-cc-text hover:bg-cc-surface2 transition-colors"
              data-testid="ctx-rename-channel"
            >Renommer</button>
            {/* Move to category submenu (flat list of categories) */}
            {(cats.length > 0 || (channelMenu.channel.category_id && true)) && (
              <>
                <div className="border-t border-cc-border my-1" />
                <div className="px-3 py-1 text-[9px] uppercase tracking-widest font-bold text-cc-muted">Déplacer vers</div>
                {cats.filter(c => c.category_id !== channelMenu.channel.category_id).map((c) => (
                  <button
                    key={c.category_id}
                    onClick={() => moveChannelToCategory(channelMenu.channel, c.category_id)}
                    className="w-full text-left px-3 py-1.5 text-xs text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text transition-colors truncate"
                    data-testid={`ctx-move-to-${c.category_id}`}
                  >→ {c.name}</button>
                ))}
                {channelMenu.channel.category_id && (
                  <button
                    onClick={() => moveChannelToCategory(channelMenu.channel, "_uncat")}
                    className="w-full text-left px-3 py-1.5 text-xs text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text transition-colors italic"
                  >→ Sans catégorie</button>
                )}
                <div className="border-t border-cc-border my-1" />
              </>
            )}
            <button
              onClick={() => deleteChannel(channelMenu.channel)}
              className="w-full text-left px-3 py-2 text-sm text-cc-danger hover:bg-cc-surface2 transition-colors"
              data-testid="ctx-delete-channel"
            >Supprimer le salon</button>
          </div>
        </>
      )}
    </>
  );
}
