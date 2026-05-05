import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Message from "./Message";

export default function MessageList({ messages, currentUser, onReact }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages.length]);

  return (
    <div ref={ref} data-testid="message-list" className="flex-1 overflow-y-auto bg-cc-surface2 py-4">
      <AnimatePresence initial={false}>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.author_id === m.author_id && (new Date(m.created_at) - new Date(prev.created_at) < 5 * 60 * 1000);
          return (
            <motion.div
              key={m.message_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Message msg={m} grouped={grouped} mine={m.author_id === currentUser?.user_id} onReact={onReact} />
            </motion.div>
          );
        })}
      </AnimatePresence>
      {messages.length === 0 && (
        <div className="text-center py-20 text-cc-muted text-xs uppercase tracking-widest">
          <span className="cc-marker">No messages yet — break the silence.</span>
        </div>
      )}
    </div>
  );
}
