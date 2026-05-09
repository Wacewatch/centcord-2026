import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWS } from "../lib/ws";
import { initials, presenceColor } from "../lib/utils";
import UserBar from "./UserBar";
import MessageList from "./MessageList";
import MessageComposer from "./MessageComposer";
import { Lock, Search, ArrowLeft } from "lucide-react";
import { ensureKeyPair, encryptDM, decryptDM } from "../lib/crypto";
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
  const myKeysRef = useRef(null);

  // Decrypt one message helper
  const decryptOne = useCallback(async (m) => {
    if (!m.encrypted || !m.nonce) return m;
    if (!other?.public_key || !myKeysRef.current?.priv) return m;
    try {
      const pk = JSON.parse(other.public_key);
      const text = await decryptDM(m.content, m.nonce, myKeysRef.current.priv, pk);
      return { ...m, content: text, _decrypted: true };
    } catch (e) {
      console.error("Decrypt failed:", e);
      return m; // Return as-is if decrypt fails
    }
  }, [other]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dms = (await api.get("/dms")).data;
      const found = dms.find((d) => d.dm_id === dmId);
      if (!found) { navigate("/app/me"); return; }
      setDm(found); setOther(found.other);
      
      // Ensure my keypair, publish public key if missing
      const kp = await ensureKeyPair();
      myKeysRef.current = kp;
      if (!user?.public_key) {
        try { 
          await api.patch("/users/me", { public_key: JSON.stringify(kp.pub) }); 
          await refreshUser(); 
        } catch (_) {}
      }
      
      // Fetch the other's latest profile (with public_key)
      const otherFresh = (await api.get(`/users/${found.other.user_id}`)).data;
      setOther(otherFresh);
      
      const { data } = await api.get(`/dms/${dmId}/messages?limit=50`);
      // Decrypt all messages with E2E
      const decrypted = await Promise.all(data.map(async (m) => {
        if (!m.encrypted) return m;
        try {
          const pk = otherFresh.public_key ? JSON.parse(otherFresh.public_key) : null;
          if (!pk) return m;
          const t = await decryptDM(m.content, m.nonce, kp.priv, pk);
          return { ...m, content: t, _decrypted: true };
        } catch (_) { return m; }
      }));
      setMessages(decrypted);
    } catch (e) { 
      console.error("Load DM error:", e);
      toast.error("Échec du chargement du MP"); 
    }
    finally { setLoading(false); }
  }, [dmId, navigate, user, refreshUser]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ws) return;
    const offCreate = ws.subscribe("message.create", async (m) => {
      if (m.dm_id !== dmId) return;
      // Decrypt message if encrypted (E2E)
      const dec = await decryptOne(m);
      setMessages((prev) => {
        // Avoid duplicates (e.g., if already added optimistically)
        if (prev.some((x) => x.message_id === dec.message_id)) return prev;
        return [...prev, dec];
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
    return () => { offCreate(); offUpdate(); offDel(); offRx(); };
  }, [ws, dmId, decryptOne]);

  const [replyTo, setReplyTo] = useState(null);
  
  const sendMessage = async (content, attachments, reply_to) => {
    // Generate temporary ID for optimistic message
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const originalContent = content;
    
    // 1. Add optimistic message FIRST with temp ID
    const optimisticMsg = {
      message_id: tempId,
      dm_id: dmId,
      content: originalContent,
      author: { 
        display_name: user?.display_name, 
        user_id: user?.user_id, 
        avatar_url: user?.avatar_url 
      },
      attachments: attachments || [],
      reply_to,
      reactions: [],
      created_at: new Date().toISOString(),
      _optimistic: true
    };
    
    setMessages((prev) => [...prev, optimisticMsg]);
    
    // 2. Prepare payload with encryption
    let payload = { content, attachments, reply_to };
    let theirPub = null;
    try { 
      theirPub = other?.public_key ? JSON.parse(other.public_key) : null; 
    } catch (_) {}
    
    if (theirPub && myKeysRef.current?.priv) {
      try {
        const enc = await encryptDM(content, myKeysRef.current.priv, theirPub);
        if (enc.nonce) {
          payload = { content: enc.content, nonce: enc.nonce, attachments, reply_to };
        }
      } catch (e) {
        console.error("Encryption failed:", e);
      }
    }
    
    // 3. Send to server
    try {
      const { data } = await api.post(`/dms/${dmId}/messages`, payload);
      
      // 4. Replace optimistic message with real one
      setMessages((prev) => 
        prev.map((m) => 
          m.message_id === tempId 
            ? { ...data, content: originalContent, author: data.author || optimisticMsg.author }
            : m
        )
      );
    } catch (e) { 
      console.error("Failed to send DM:", e);
      toast.error("Échec de l'envoi");
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.message_id !== tempId));
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
            <MessageComposer placeholder={`Message privé (E2E chiffré)`} onSend={sendMessage} testIdPrefix="dm" replyTo={replyTo} onCancelReply={() => setReplyTo(null)} />
          </>
        )}
      </div>
      {/* Call components removed */}
    </main>
  );
}
