import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { initials } from '../lib/utils';

/**
 * Renders an inline autocomplete dropdown above the message composer.
 * Triggers on @ (members) or # (channels) typed at cursor.
 *
 * Props:
 *   text          : the current input text
 *   cursor        : current cursor position in text
 *   serverId      : current server id (for members + channels)
 *   onPick(replacement, newCursor) : callback when user selects an item
 */
export default function MentionAutocomplete({ text, cursor, serverId, onPick }) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [trigger, setTrigger] = useState(null); // { kind: '@'|'#', start, query }

  useEffect(() => {
    if (cursor == null) return setTrigger(null);
    const upto = text.slice(0, cursor);
    const m = upto.match(/(^|\s)([@#])([\w-]{0,30})$/);
    if (!m) return setTrigger(null);
    const start = upto.length - m[2].length - m[3].length;
    setTrigger({ kind: m[2], start, query: m[3] });
    setActive(0);
  }, [text, cursor]);

  useEffect(() => {
    if (!trigger || !serverId) return setItems([]);
    let cancelled = false;
    (async () => {
      try {
        if (trigger.kind === '@') {
          const { data } = await api.get(`/servers/${serverId}/members`);
          const q = trigger.query.toLowerCase();
          const list = (data || []).filter((m) => (m.user?.display_name || '').toLowerCase().includes(q)).slice(0, 6);
          if (!cancelled) setItems(list.map((m) => ({ kind: '@', label: m.user?.display_name, sub: m.nickname || '', avatar: m.user?.avatar_url, value: '@' + (m.user?.display_name || '') })));
        } else {
          const { data } = await api.get(`/servers/${serverId}`);
          const q = trigger.query.toLowerCase();
          const list = (data?.channels || []).filter((c) => c.type !== 'voice' && (c.name || '').toLowerCase().includes(q)).slice(0, 6);
          if (!cancelled) setItems(list.map((c) => ({ kind: '#', label: c.name, sub: c.topic || '', value: '#' + c.name })));
        }
      } catch (_) {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [trigger, serverId]);

  const pick = (i) => {
    const item = items[i];
    if (!item || !trigger) return;
    const before = text.slice(0, trigger.start);
    const after = text.slice(cursor);
    const replaced = before + item.value + ' ' + after;
    const newCursor = (before + item.value + ' ').length;
    onPick(replaced, newCursor);
  };

  // Keyboard nav exposed to parent via window-level events
  useEffect(() => {
    const handler = (e) => {
      if (!trigger || items.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') setTrigger(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, items, active]);

  if (!trigger || items.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-cc-surface1 border border-cc-border cc-brutal-shadow z-30 max-h-64 overflow-y-auto">
      <div className="text-[10px] uppercase tracking-widest text-cc-muted px-3 py-1 border-b border-cc-border">{trigger.kind === '@' ? 'Mentionner un membre' : 'Lier un salon'}</div>
      {items.map((it, i) => (
        <button
          key={i}
          onMouseDown={(e) => { e.preventDefault(); pick(i); }}
          onMouseEnter={() => setActive(i)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-cc-accent text-white' : 'hover:bg-cc-surface2'}`}
        >
          {it.kind === '@' ? (
            <span className={`w-6 h-6 flex items-center justify-center text-xs font-extrabold border ${i === active ? 'border-white' : 'border-cc-border'} bg-cc-base overflow-hidden`}>
              {it.avatar ? <img src={it.avatar} alt="" className="w-full h-full object-cover" /> : initials(it.label)}
            </span>
          ) : (
            <span className={`w-6 h-6 flex items-center justify-center text-xs font-extrabold border ${i === active ? 'border-white' : 'border-cc-border'} bg-cc-base`}>#</span>
          )}
          <span className="font-bold truncate">{it.label}</span>
          {it.sub && <span className={`truncate text-xs ${i === active ? 'text-white/80' : 'text-cc-muted'}`}>{it.sub}</span>}
        </button>
      ))}
    </div>
  );
}
