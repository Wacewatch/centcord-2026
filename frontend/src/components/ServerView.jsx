import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
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
import BoostBadge from "./BoostBadge";
import { Hash, Volume2, Megaphone, BookOpen, ChevronDown, ChevronRight, Plus, Settings, Users, Pin, Search } from "lucide-react";
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
  const [server, setServer] = useState(null);
  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [showMembers, setShowMembers] = useState(true);
  const [collapsedCats, setCollapsedCats] = useState({});
  const [openSettings, setOpenSettings] = useState(false);
  const [openCreateChannel, setOpenCreateChannel] = useState(null); // null | { categoryId }
  const [openPins, setOpenPins] = useState(false);
  const [openSearch, setOpenSearch] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [activeThread, setActiveThread] = useState(null); // { thread, parent }
  const [customEmojis, setCustomEmojis] = useState([]);
  const [unread, setUnread] = useState({}); // { channel_id: count }

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

  useEffect(() => { loadServer(); loadMembers(); loadEmojis(); loadUnread(); }, [loadServer, loadMembers, loadEmojis, loadUnread]);
  useEffect(() => { if (channel?.channel_id && channel.type === "text") { loadMessages(channel.channel_id); markRead(channel.channel_id); } }, [channel, loadMessages, markRead]);
  useEffect(() => { setReplyTo(null); setActiveThread(null); }, [channel?.channel_id]);

  useEffect(() => {
    if (!ws) return;
    const offC = ws.subscribe("message.create", (m) => {
      if (m.channel_id === channel?.channel_id && !m.thread_id) {
        setMessages((prev) => [...prev, m]);
        markRead(m.channel_id);
      } else if (m.channel_id && m.author_id !== user?.user_id) {
        setUnread((u) => ({ ...u, [m.channel_id]: (u[m.channel_id] || 0) + 1 }));
      }
    });
    const offU = ws.subscribe("message.update", (d) => setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, content: d.content, edited_at: d.edited_at } : m)));
    const offD = ws.subscribe("message.delete", (d) => setMessages((prev) => prev.filter((m) => m.message_id !== d.message_id)));
    const offR = ws.subscribe("message.reaction", (d) => setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, reactions: d.reactions } : m)));
    const offChCreate = ws.subscribe("channel.create", () => loadServer());
    const offChDel = ws.subscribe("channel.delete", () => loadServer());
    const offMember = ws.subscribe("member.join", () => loadMembers());
    const offEmCreate = ws.subscribe("emoji.create", () => loadEmojis());
    const offEmDel = ws.subscribe("emoji.delete", () => loadEmojis());
    const offBoost = ws.subscribe("server.boost", () => loadServer());
    const offThread = ws.subscribe("thread.create", (t) => {
      // Mark parent message as having a thread
      setMessages((prev) => prev.map((m) => m.message_id === t.parent_message_id ? { ...m, thread_id: t.thread_id } : m));
    });
    return () => { offC(); offU(); offD(); offR(); offChCreate(); offChDel(); offMember(); offEmCreate(); offEmDel(); offBoost(); offThread(); };
  }, [ws, channel, loadServer, loadMembers, loadEmojis]);

  if (!server) {
    return (
      <main className="flex-1 flex items-center justify-center bg-cc-surface2">
        <div className="cc-spinner" />
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
  const cats = [...(server.categories || [])];
  const Icon = channelIcon(channel?.type);

  const sendMsg = async (content, attachments, reply_to) => {
    if (!channel) return;
    try { await api.post(`/channels/${channel.channel_id}/messages`, { content, attachments, reply_to }); }
    catch (_) { toast.error("Échec de l'envoi"); }
  };

  const createChannel = (categoryId = null) => {
    setOpenCreateChannel({ categoryId });
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

  return (
    <>
      <aside className="w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0">
        <button data-testid="server-header" onClick={() => setOpenSettings(true)} className="h-12 border-b border-cc-border px-4 flex items-center justify-between hover:bg-cc-surface2 transition-colors">
          <span className="font-display font-extrabold uppercase tracking-tighter text-sm truncate">{server.name}</span>
          <ChevronDown className="w-4 h-4 text-cc-muted" />
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
                  <ul className="mt-1 space-y-0.5">
                    {list.map((c) => {
                      const Ic = channelIcon(c.type);
                      const active = c.channel_id === channel?.channel_id;
                      const unreadCount = unread[c.channel_id] || 0;
                      return (
                        <li key={c.channel_id}>
                          <button
                            onClick={() => navigate(`/app/servers/${serverId}/channels/${c.channel_id}`)}
                            data-testid={`channel-${c.channel_id}`}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                              active ? "bg-cc-surface2 text-cc-text" : (unreadCount > 0 ? "text-cc-text font-bold hover:bg-cc-surface2" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text")
                            )}
                          >
                            <Ic className="w-4 h-4 text-cc-muted shrink-0" />
                            <span className="truncate flex-1 text-left">{c.name}</span>
                            {unreadCount > 0 && !active && (
                              <span className="shrink-0 text-[10px] font-bold bg-cc-accent text-white px-1.5 py-0.5 rounded-full min-w-[18px] text-center" data-testid={`unread-${c.channel_id}`}>
                                {unreadCount > 99 ? "99+" : unreadCount}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          {(channelsByCat["_uncat"] || []).length > 0 && (
            <ul className="space-y-0.5">
              {channelsByCat["_uncat"].map((c) => {
                const Ic = channelIcon(c.type);
                const active = c.channel_id === channel?.channel_id;
                return (
                  <li key={c.channel_id}>
                    <button onClick={() => navigate(`/app/servers/${serverId}/channels/${c.channel_id}`)} className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors", active ? "bg-cc-surface2 text-cc-text" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text")}>
                      <Ic className="w-4 h-4 text-cc-muted shrink-0" />
                      <span className="truncate">{c.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-auto"><UserBar /></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-cc-border px-4 flex items-center gap-3">
          <Icon className="w-4 h-4 text-cc-muted" />
          <span className="font-display font-bold uppercase tracking-tight text-sm" data-testid="channel-name">{channel?.name || "—"}</span>
          {channel?.topic && (
            <>
              <div className="w-px h-5 bg-cc-border" />
              <span className="text-cc-subtext text-xs truncate">{channel.topic}</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <BoostBadge server={server} onChange={loadServer} />
            <button onClick={() => setOpenPins(true)} data-testid="header-pins" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text" title="Épinglés"><Pin className="w-4 h-4" /></button>
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
            <MessageList
              messages={messages}
              currentUser={user}
              onReact={(id, e) => api.post(`/messages/${id}/reactions`, { emoji: e })}
              onReply={(m) => setReplyTo(m)}
              onCreateThread={handleCreateThread}
              onOpenThread={(t, parent) => setActiveThread({ thread: t, parent })}
              customEmojiMap={customEmojiMap}
            />
            <MessageComposer
              placeholder={`Message #${channel?.name || ""}`}
              onSend={sendMsg}
              testIdPrefix="ch"
              serverId={serverId}
              channelId={channel?.channel_id}
              replyTo={replyTo}
              onCancelReply={() => setReplyTo(null)}
            />
          </>
        )}
      </main>

      {activeThread && <ThreadPanel thread={activeThread.thread} parentMessage={activeThread.parent} onClose={() => setActiveThread(null)} />}
      {showMembers && !activeThread && <MembersSidebar members={members} server={server} reload={loadMembers} />}
      {openSettings && <ServerSettingsModal server={server} reload={() => { loadServer(); reload && reload(); }} onClose={() => setOpenSettings(false)} />}
      {openCreateChannel && <CreateChannelModal serverId={serverId} categories={server.categories || []} defaultCategoryId={openCreateChannel.categoryId} onClose={() => setOpenCreateChannel(null)} onCreated={() => loadServer()} />}
      {openPins && channel && <PinModal channelId={channel.channel_id} onClose={() => setOpenPins(false)} />}
      {openSearch && <SearchModal serverId={serverId} onClose={() => setOpenSearch(false)} />}
    </>
  );
}
