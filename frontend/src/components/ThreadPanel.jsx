import React, { useEffect, useState, useCallback, useRef } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import Message from "./Message";
import MessageComposer from "./MessageComposer";
import { X, MessagesSquare } from "lucide-react";
import { toast } from "sonner";

export default function ThreadPanel({ thread, parentMessage, onClose }) {
  const { user } = useAuth();
  const ws = useWS();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get(`/threads/${thread.thread_id}/messages`); setMessages(data); }
    catch (_) {} finally { setLoading(false); }
  }, [thread.thread_id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages.length]);

  useEffect(() => {
    if (!ws) return;
    const off = ws.subscribe("thread.message", (m) => {
      if (m.thread_id === thread.thread_id) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((x) => x.message_id === m.message_id)) return prev;
          return [...prev, m];
        });
      }
    });
    return () => off();
  }, [ws, thread.thread_id]);

  const send = async (content, attachments) => {
    try {
      const { data } = await api.post(`/threads/${thread.thread_id}/messages`, { content, attachments });
      // Optimistically append the message
      if (data && data.message_id) {
        setMessages((prev) => {
          if (prev.some((m) => m.message_id === data.message_id)) return prev;
          return [...prev, data];
        });
      }
    }
    catch (_) { toast.error("Échec de l'envoi"); }
  };

  return (
    <aside className="w-96 bg-cc-surface1 border-l border-cc-border flex flex-col shrink-0" data-testid="thread-panel">
      <header className="h-12 border-b border-cc-border px-4 flex items-center gap-2">
        <MessagesSquare className="w-4 h-4 text-cc-accent" />
        <span className="font-display font-bold uppercase tracking-tight text-sm flex-1 truncate">{thread.name}</span>
        <button onClick={onClose} className="p-1.5 hover:bg-cc-surface2 text-cc-muted hover:text-cc-text"><X className="w-4 h-4" /></button>
      </header>
      {parentMessage && (
        <div className="px-4 py-3 border-b border-cc-border bg-cc-surface2">
          <div className="text-[10px] uppercase tracking-widest text-cc-muted mb-1">Message d'origine</div>
          <div className="text-xs text-cc-subtext"><span className="font-bold text-cc-accent">{parentMessage.author?.display_name}</span> : {parentMessage.content}</div>
        </div>
      )}
      <div ref={listRef} className="flex-1 overflow-y-auto bg-cc-surface2 py-3">
        {loading ? <div className="flex justify-center py-10"><div className="cc-spinner" /></div> :
          messages.length === 0 ? <div className="text-center text-cc-muted text-xs uppercase tracking-widest py-10">Soyez le premier à répondre</div> :
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const grouped = prev && prev.author_id === m.author_id;
            return <Message key={m.message_id} msg={m} grouped={grouped} mine={m.author_id === user?.user_id} onReact={(id, e) => api.post(`/messages/${id}/reactions`, { emoji: e })} />;
          })
        }
      </div>
      <MessageComposer placeholder="Répondre dans le fil..." onSend={send} testIdPrefix="thread" compact />
    </aside>
  );
}
