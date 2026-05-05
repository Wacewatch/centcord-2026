import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import UserBar from "./UserBar";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import MembersSidebar from "./MembersSidebar";
import ServerSettingsModal from "./modals/ServerSettingsModal";
import { Hash, Volume2, Megaphone, BookOpen, ChevronDown, ChevronRight, Plus, Settings, Users, Pin, Search, Bell } from "lucide-react";
import { initials, cn } from "../lib/utils";
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
    } catch (e) { toast.error("Failed to load server"); }
  }, [serverId, channelId, navigate]);

  const loadMembers = useCallback(async () => {
    try { const { data } = await api.get(`/servers/${serverId}/members`); setMembers(data); } catch (_) {}
  }, [serverId]);

  const loadMessages = useCallback(async (cid) => {
    if (!cid) return;
    try { const { data } = await api.get(`/channels/${cid}/messages?limit=50`); setMessages(data); } catch (_) {}
  }, []);

  useEffect(() => { loadServer(); loadMembers(); }, [loadServer, loadMembers]);
  useEffect(() => { if (channel?.channel_id && channel.type === "text") loadMessages(channel.channel_id); }, [channel, loadMessages]);

  useEffect(() => {
    if (!ws) return;
    const offC = ws.subscribe("message.create", (m) => {
      if (m.channel_id === channel?.channel_id) setMessages((prev) => [...prev, m]);
    });
    const offU = ws.subscribe("message.update", (d) => setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, content: d.content, edited_at: d.edited_at } : m)));
    const offD = ws.subscribe("message.delete", (d) => setMessages((prev) => prev.filter((m) => m.message_id !== d.message_id)));
    const offR = ws.subscribe("message.reaction", (d) => setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, reactions: d.reactions } : m)));
    const offChCreate = ws.subscribe("channel.create", () => loadServer());
    const offChDel = ws.subscribe("channel.delete", () => loadServer());
    const offMember = ws.subscribe("member.join", () => loadMembers());
    return () => { offC(); offU(); offD(); offR(); offChCreate(); offChDel(); offMember(); };
  }, [ws, channel, loadServer, loadMembers]);

  if (!server) {
    return (
      <main className="flex-1 flex items-center justify-center bg-cc-surface2">
        <div className="cc-spinner" />
      </main>
    );
  }

  const channelsByCat = {};
  for (const c of server.channels || []) {
    const k = c.category_id || "_uncat";
    channelsByCat[k] = channelsByCat[k] || [];
    channelsByCat[k].push(c);
  }
  const cats = [...(server.categories || [])];
  const Icon = channelIcon(channel?.type);

  const sendMsg = async (content, attachments) => {
    if (!channel) return;
    try { await api.post(`/channels/${channel.channel_id}/messages`, { content, attachments }); }
    catch (_) { toast.error("Send failed"); }
  };

  const createChannel = async () => {
    const name = prompt("Channel name?");
    if (!name) return;
    try {
      await api.post(`/servers/${serverId}/channels`, { name, type: "text" });
      await loadServer();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create channel"); }
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
                  <Plus onClick={(e) => { e.stopPropagation(); createChannel(); }} className="w-3 h-3 hover:text-cc-accent" />
                </button>
                {!collapsed && (
                  <ul className="mt-1 space-y-0.5">
                    {list.map((c) => {
                      const Ic = channelIcon(c.type);
                      const active = c.channel_id === channel?.channel_id;
                      return (
                        <li key={c.channel_id}>
                          <button
                            onClick={() => navigate(`/app/servers/${serverId}/channels/${c.channel_id}`)}
                            data-testid={`channel-${c.channel_id}`}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                              active ? "bg-cc-surface2 text-cc-text" : "text-cc-subtext hover:bg-cc-surface2 hover:text-cc-text"
                            )}
                          >
                            <Ic className="w-4 h-4 text-cc-muted shrink-0" />
                            <span className="truncate">{c.name}</span>
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
            <button data-testid="header-pins" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text"><Pin className="w-4 h-4" /></button>
            <button data-testid="header-toggle-members" onClick={() => setShowMembers(!showMembers)} className={cn("p-2 hover:bg-cc-surface2 transition-colors", showMembers ? "text-cc-text" : "text-cc-subtext")}><Users className="w-4 h-4" /></button>
            <button data-testid="header-search" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text"><Search className="w-4 h-4" /></button>
            <button data-testid="header-notifs" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text"><Bell className="w-4 h-4" /></button>
            <button data-testid="header-settings" onClick={() => setOpenSettings(true)} className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text"><Settings className="w-4 h-4" /></button>
          </div>
        </header>
        {channel?.type === "voice" ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-cc-surface2 p-10">
            <Volume2 className="w-12 h-12 text-cc-muted mb-4" />
            <div className="font-display font-extrabold text-2xl uppercase tracking-tight">{channel.name}</div>
            <p className="text-cc-subtext mt-2 max-w-md text-center text-sm">Voice channels are signaling-ready (WebRTC). Connect peers via /api/voice/signal.</p>
            <button data-testid="join-voice" className="mt-6 bg-cc-accent text-white font-bold uppercase tracking-wider px-6 py-3 cc-brutal-shadow cc-brutal-press">Join voice</button>
          </div>
        ) : (
          <>
            <MessageList messages={messages} currentUser={user} onReact={(id, e) => api.post(`/messages/${id}/reactions`, { emoji: e })} />
            <MessageComposer placeholder={`Message #${channel?.name || ""}`} onSend={sendMsg} testIdPrefix="ch" />
          </>
        )}
      </main>

      {showMembers && <MembersSidebar members={members} server={server} reload={loadMembers} />}
      {openSettings && <ServerSettingsModal server={server} reload={() => { loadServer(); reload && reload(); }} onClose={() => setOpenSettings(false)} />}
    </>
  );
}
