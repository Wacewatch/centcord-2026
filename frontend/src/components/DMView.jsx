import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import { initials, presenceColor } from "../lib/utils";
import UserBar from "./UserBar";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import { Search, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function DMView() {
  const { dmId } = useParams();
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const ws = useWS();
  const [dm, setDm] = useState(null);
  const [other, setOther] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dms = (await api.get("/dms")).data;
      const found = dms.find((d) => d.dm_id === dmId);
      if (!found) { navigate("/app/me"); return; }
      setDm(found); setOther(found.other);
      
      // Fetch the other's latest profile
      const otherFresh = (await api.get(`/users/${found.other.user_id}`)).data;
      setOther(otherFresh);
      const { data } = await api.get(`/dms/${dmId}/messages?limit=50`);
      // NO E2E decryption - messages are plain text
      setMessages(data);
    } catch (e) { toast.error("Échec du chargement du MP"); }
    finally { setLoading(false); }
  }, [dmId, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ws) return;
    const offCreate = ws.subscribe("message.create", (m) => {
      if (m.dm_id !== dmId) return;
      // NO decryption needed
      setMessages((prev) => {
        // Avoid duplicates (e.g., if already added optimistically)
        if (prev.some((x) => x.message_id === m.message_id)) return prev;
        return [...prev, m];
      });
    });
    const offUpdate = ws.subscribe("message.update", (d) => {
      setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, content: d.content, edited_at: d.edited_at } : m));
    });
    const offDel = ws.subscribe("message.delete", (d) => {
      setMessages((prev) => prev.filter((m) => m.message_id !== d.message_id));
    });
    const offRx = ws.subscribe("message.reaction", (d) => {
      setMessages((prev) => prev.map((m) => m.message_id === d.message_id ? { ...m, reactions: d.reactions } : m));
    });
    // Call system removed
    return () => { offCreate(); offUpdate(); offDel(); offRx(); };
  }, [ws, dmId]);

  const [replyTo, setReplyTo] = useState(null);
  
  const sendMessage = async (content, attachments, reply_to) => {
    // Simplified: NO E2E encryption for now
    const payload = { content, attachments, reply_to };
    
    try {
      const { data } = await api.post(`/dms/${dmId}/messages`, payload);
      // Optimistically append the message (with deduplication against WS event)
      if (data && data.message_id) {
        // Ensure the message has all required fields for display
        const messageToAdd = {
          ...data,
          author: data.author || { display_name: user?.display_name, user_id: user?.user_id, avatar_url: user?.avatar_url }
        };
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === data.message_id)) return prev;
          return [...prev, messageToAdd];
        });
      }
    }
    catch (e) { 
      console.error("Failed to send DM:", e);
      toast.error("Échec de l'envoi"); 
    }
    setReplyTo(null);
  };

  return (
    <main className="flex-1 flex min-w-0">
      <aside className="w-64 bg-cc-surface1 border-r border-cc-border flex flex-col shrink-0 hidden md:flex">
        <button onClick={() => navigate("/app/me")} data-testid="dm-back" className="px-4 h-12 border-b border-cc-border flex items-center gap-2 hover:bg-cc-surface2">
          <ArrowLeft className="w-4 h-4" /> <span className="font-display font-extrabold uppercase text-sm">Retour aux MP</span>
        </button>
        <div className="mt-auto"><UserBar /></div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-cc-border px-4 flex items-center gap-3">
          <div className="relative">
            <div className="w-7 h-7 bg-cc-base flex items-center justify-center font-display font-extrabold rounded-sm border border-cc-border text-[10px]">
              {other?.avatar_url ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover rounded-[inherit]" /> : initials(other?.display_name || "?")}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 cc-status-dot ${presenceColor(other?.status)}`} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm" data-testid="dm-other-name">{other?.display_name}</span>
            <span className="text-[10px] uppercase tracking-widest text-cc-muted flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" /> {other?.public_key ? "Chiffré bout-en-bout" : "En attente de la clé du contact"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {/* Call buttons removed - not working */}
            <button data-testid="dm-search" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text" title="Rechercher"><Search className="w-4 h-4" /></button>
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="cc-spinner" /></div>
        ) : (
          <>
            <MessageList messages={messages} currentUser={user} onReact={(id, e) => api.post(`/messages/${id}/reactions`, { emoji: e })} onReply={(m) => setReplyTo(m)} />
            <MessageComposer placeholder={`Message à ${other?.display_name || ""}`} onSend={sendMessage} testIdPrefix="dm" replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
          </>
        )}
      </div>
      {/* Call components removed */}
    </main>
  );
}
