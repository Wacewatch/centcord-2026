import React, { useEffect, useState } from "react";
import api from "../lib/api";
import { useWS } from "../lib/ws";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NotificationsPanel() {
  const ws = useWS();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  const load = async () => {
    try { const { data } = await api.get("/notifications"); setItems(data); } catch (_) {}
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!ws) return;
    const off = ws.subscribe("notification.new", (n) => setItems((prev) => [n, ...prev]));
    return () => off();
  }, [ws]);

  const unreadCount = items.filter(i => !i.read).length;
  const markRead = async () => { try { await api.patch("/notifications/read"); setItems(items.map(i => ({ ...i, read: true }))); } catch (_) {} };
  const onClick = (n) => {
    setOpen(false);
    if (n.kind === "mention" && n.data?.server_id && n.data?.channel_id) {
      navigate(`/app/servers/${n.data.server_id}/channels/${n.data.channel_id}`);
    } else if (n.kind === "dm" && n.data?.dm_id) {
      navigate(`/app/me/${n.data.dm_id}`);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => { setOpen(!open); if (!open) markRead(); }} data-testid="notifs-toggle" className="p-2 hover:bg-cc-surface2 text-cc-subtext hover:text-cc-text relative" title="Notifications">
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-cc-accent rounded-full" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-cc-surface1 border border-cc-border cc-brutal-shadow z-50"
          >
            <div className="px-4 py-3 border-b border-cc-border flex items-center justify-between">
              <span className="font-display font-extrabold uppercase tracking-tight text-sm">Notifications</span>
              <button onClick={() => setOpen(false)} className="text-cc-muted hover:text-cc-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && <div className="p-6 text-cc-muted text-xs uppercase tracking-widest text-center">Aucune notification</div>}
              {items.map((n) => (
                <button key={n.notif_id} onClick={() => onClick(n)} className="w-full text-left px-4 py-3 hover:bg-cc-surface2 transition-colors border-b border-cc-border">
                  <div className="text-xs uppercase tracking-widest text-cc-accent">{n.kind === "mention" ? "Mention" : n.kind === "dm" ? "MP" : n.kind}</div>
                  <div className="text-sm mt-1">
                    {n.kind === "mention" && <>{n.data?.from} vous a mentionné·e</>}
                    {n.kind === "dm" && <>{n.data?.from} vous a écrit en privé</>}
                  </div>
                  <div className="text-[10px] text-cc-muted mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
