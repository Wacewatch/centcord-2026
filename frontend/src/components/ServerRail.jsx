import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  pointerWithin,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Compass, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { initials, cn } from "../lib/utils";
import { useMobile } from "../lib/mobile";
import { useWS } from "../lib/ws";
import api from "../lib/api";
import { toast } from "sonner";

/* ========================== Tooltip ========================== */
function Tooltip({ label, children }) {
  return (
    <div className="group/tip relative flex items-center">
      {children}
      <span className="pointer-events-none hidden md:inline absolute left-full ml-3 z-50 whitespace-nowrap bg-cc-surface2 border border-cc-border text-cc-text text-xs uppercase tracking-widest font-bold px-3 py-2 opacity-0 group-hover/tip:opacity-100 transition-opacity">
        {label}
      </span>
    </div>
  );
}

/* ========================== Server Tile ========================== */
function ServerTile({ server, active, badge, onClick, dragListeners, dragAttrs }) {
  return (
    <Tooltip label={server.name}>
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={onClick}
        data-testid={`rail-server-${server.server_id}`}
        {...dragAttrs}
        {...dragListeners}
        className={cn(
          "relative w-12 h-12 flex items-center justify-center text-cc-text transition-all border overflow-hidden cursor-grab active:cursor-grabbing",
          active ? "bg-cc-accent border-transparent rounded-sm" : "bg-cc-surface2 border-cc-border rounded-xl hover:rounded-sm hover:bg-cc-accent hover:border-transparent"
        )}
      >
        {active && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-7 bg-cc-accent" />}
        {!active && badge > 0 && (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-3 bg-white" />
        )}
        {server.icon_url ? (
          <img src={server.icon_url} alt={server.name} className="w-full h-full object-cover" />
        ) : (
          <span className="font-display font-extrabold text-base">{initials(server.name)}</span>
        )}
        {badge > 0 && (
          <span
            data-testid={`rail-badge-rail-server-${server.server_id}`}
            className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-cc-danger text-white text-[10px] font-extrabold rounded-full border-2 border-cc-base shadow"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </motion.button>
    </Tooltip>
  );
}

/* ========================== Sortable wrappers ========================== */
function SortableServer({ server, active, badge, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `server:${server.server_id}`,
    data: { kind: "server", server_id: server.server_id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <ServerTile
        server={server}
        active={active}
        badge={badge}
        onClick={onClick}
        dragListeners={listeners}
        dragAttrs={attributes}
      />
    </div>
  );
}

/* ========================== Folder Tile ========================== */
function FolderPreview({ folder, serversById, color }) {
  const ids = (folder.server_ids || []).slice(0, 4);
  return (
    <div
      className="w-12 h-12 grid grid-cols-2 grid-rows-2 gap-0.5 p-1 border border-cc-border rounded-xl"
      style={{ background: `${color}22` }}
    >
      {Array.from({ length: 4 }).map((_, i) => {
        const sid = ids[i];
        const s = sid ? serversById[sid] : null;
        if (!s) return <div key={i} className="bg-transparent" />;
        return s.icon_url ? (
          <img key={i} src={s.icon_url} alt={s.name} className="w-full h-full object-cover rounded-sm" />
        ) : (
          <div key={i} className="bg-cc-surface2 rounded-sm flex items-center justify-center text-[8px] font-bold text-cc-text">
            {initials(s.name).slice(0, 1)}
          </div>
        );
      })}
    </div>
  );
}

function SortableFolder({ folder, serversById, expanded, onToggle, onRename, onUngroup, activeServerId, unread, onPickServer }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `folder:${folder.folder_id}`,
    data: { kind: "folder", folder_id: folder.folder_id },
  });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-drop:${folder.folder_id}`,
    data: { kind: "folder-drop", folder_id: folder.folder_id },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  const folderUnread = (folder.server_ids || []).reduce((sum, sid) => sum + (unread[sid] || 0), 0);
  const totalServers = (folder.server_ids || []).length;
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="w-full flex flex-col items-center gap-2">
      <div ref={setDropRef} className={cn("relative", isOver && "ring-2 ring-cc-accent rounded-xl")}>
        <Tooltip label={folder.name || "Dossier"}>
          <button
            onClick={onToggle}
            onContextMenu={(e) => { e.preventDefault(); setShowMenu(true); }}
            data-testid={`rail-folder-${folder.folder_id}`}
            {...attributes}
            {...listeners}
            className="relative w-12 h-12 flex items-center justify-center cursor-grab active:cursor-grabbing"
          >
            <FolderPreview folder={folder} serversById={serversById} color={folder.color || "#FF3B00"} />
            {folderUnread > 0 && !expanded && (
              <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-cc-danger text-white text-[10px] font-extrabold rounded-full border-2 border-cc-base shadow">
                {folderUnread > 99 ? "99+" : folderUnread}
              </span>
            )}
            <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-cc-surface2 border border-cc-border text-[9px] font-bold text-cc-text">
              {totalServers}
            </span>
          </button>
        </Tooltip>
        {showMenu && (
          <FolderMenu
            folder={folder}
            onClose={() => setShowMenu(false)}
            onRename={(name, color) => { onRename(name, color); setShowMenu(false); }}
            onUngroup={() => { onUngroup(); setShowMenu(false); }}
          />
        )}
      </div>
      {expanded && (
        <div className="w-full flex flex-col items-center gap-2 py-1.5 px-1 bg-cc-surface1/50 rounded-xl border border-cc-border/50">
          <SortableContext items={(folder.server_ids || []).map((sid) => `server:${sid}`)} strategy={verticalListSortingStrategy}>
            {(folder.server_ids || []).map((sid) => {
              const s = serversById[sid];
              if (!s) return null;
              return (
                <SortableServer
                  key={sid}
                  server={s}
                  active={s.server_id === activeServerId}
                  badge={unread[s.server_id] || 0}
                  onClick={() => onPickServer(s.server_id)}
                />
              );
            })}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

function FolderMenu({ folder, onClose, onRename, onUngroup }) {
  const [name, setName] = useState(folder.name || "Dossier");
  const [color, setColor] = useState(folder.color || "#FF3B00");
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute left-full ml-3 top-0 z-50 bg-cc-surface2 border border-cc-border p-3 w-56 shadow-2xl rounded-md"
      onClick={(e) => e.stopPropagation()}
      data-testid={`folder-menu-${folder.folder_id}`}
    >
      <div className="text-[10px] uppercase tracking-widest text-cc-muted mb-1">Nom du dossier</div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={32}
        className="w-full bg-cc-surface1 border border-cc-border px-2 py-1 text-sm text-cc-text outline-none focus:border-cc-accent mb-2"
        data-testid={`folder-rename-input-${folder.folder_id}`}
      />
      <div className="text-[10px] uppercase tracking-widest text-cc-muted mb-1">Couleur</div>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {["#FF3B00", "#FFD400", "#0099FF", "#00CC88", "#AA66FF", "#FF66B2", "#FFFFFF"].map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{ background: c }}
            className={cn("w-5 h-5 rounded-full border-2", color === c ? "border-cc-text" : "border-cc-border")}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onRename(name.trim() || "Dossier", color)}
          className="flex-1 bg-cc-accent text-white text-[10px] uppercase tracking-widest font-bold py-1.5"
          data-testid={`folder-save-${folder.folder_id}`}
        >Enregistrer</button>
        <button
          onClick={onUngroup}
          className="flex-1 bg-cc-surface1 border border-cc-border text-cc-danger text-[10px] uppercase tracking-widest font-bold py-1.5"
          data-testid={`folder-ungroup-${folder.folder_id}`}
        >Dégrouper</button>
      </div>
    </div>
  );
}

/* ========================== Rail Item (small button for menu actions) ========================== */
function RailButton({ active, onClick, label, testId, children, badge }) {
  return (
    <Tooltip label={label}>
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        onClick={onClick}
        data-testid={testId}
        className={cn(
          "relative w-12 h-12 flex items-center justify-center text-cc-text transition-all border overflow-hidden",
          active ? "bg-cc-accent border-transparent rounded-sm" : "bg-cc-surface2 border-cc-border rounded-xl hover:rounded-sm hover:bg-cc-accent hover:border-transparent"
        )}
      >
        {active && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-7 bg-cc-accent" />}
        {children}
        {badge > 0 && (
          <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-cc-danger text-white text-[10px] font-extrabold rounded-full border-2 border-cc-base shadow">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </motion.button>
    </Tooltip>
  );
}

/* ========================== Main ServerRail ========================== */
export default function ServerRail({ servers, onCreate, onJoin }) {
  const navigate = useNavigate();
  const { serverId } = useParams();
  const { isMobile, drawerOpen, closeDrawer } = useMobile();
  const ws = useWS();
  const [unread, setUnread] = useState({});
  const [layout, setLayout] = useState({ items: [] });
  const [expanded, setExpanded] = useState({}); // folder_id -> bool
  const [activeDrag, setActiveDrag] = useState(null);
  const saveTimer = useRef(null);

  const path = window.location.pathname;
  const homeActive = path.startsWith("/app/me");
  const discoverActive = path.startsWith("/app/discover");
  const settingsActive = path.startsWith("/app/settings");

  const serversById = useMemo(() => {
    const m = {};
    for (const s of servers) m[s.server_id] = s;
    return m;
  }, [servers]);

  const loadUnread = useCallback(async () => {
    try { const { data } = await api.get("/servers/unread"); setUnread(data || {}); } catch (_) {}
  }, []);

  const loadLayout = useCallback(async () => {
    try {
      const { data } = await api.get("/me/rail");
      setLayout(data || { items: [] });
    } catch (_) {}
  }, []);

  useEffect(() => { loadUnread(); loadLayout(); }, [loadUnread, loadLayout]);

  // Re-sync layout when server list changes (new join, leave)
  useEffect(() => { loadLayout(); }, [servers.length, loadLayout]);

  useEffect(() => {
    if (!ws) return;
    const offCreate = ws.subscribe("message.create", (m) => {
      if (!m?.server_id || !m?.channel_id) return;
      const inActiveChannel = path.includes(`/channels/${m.channel_id}`);
      if (inActiveChannel) return;
      setUnread((u) => ({ ...u, [m.server_id]: (u[m.server_id] || 0) + 1 }));
    });
    const off1 = ws.subscribe("server.delete", () => loadUnread());
    const off2 = ws.subscribe("server.join", () => loadUnread());
    const intv = setInterval(loadUnread, 30000);
    return () => { offCreate(); off1(); off2(); clearInterval(intv); };
  }, [ws, path, loadUnread]);

  const persistLayout = useCallback((next) => {
    setLayout(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.put("/me/rail", { items: next.items.map((it) => {
          if (it.type === "server") return { type: "server", server_id: it.server_id };
          return { type: "folder", folder: {
            folder_id: it.folder_id,
            name: it.name,
            color: it.color,
            collapsed: it.collapsed,
            server_ids: it.server_ids,
          }};
        }) });
      } catch (_) { toast.error("Échec de la sauvegarde de la disposition"); }
    }, 500);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const go = (to, sid) => {
    navigate(to);
    if (sid) setUnread((u) => { const n = { ...u }; delete n[sid]; return n; });
    if (isMobile) closeDrawer();
  };

  const findServerInLayout = (items, server_id) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type === "server" && it.server_id === server_id) return { topIndex: i, folderIndex: -1 };
      if (it.type === "folder") {
        const fi = (it.server_ids || []).indexOf(server_id);
        if (fi >= 0) return { topIndex: i, folderIndex: fi };
      }
    }
    return null;
  };

  const removeServer = (items, server_id) => {
    const next = items.map((it) => {
      if (it.type === "folder") return { ...it, server_ids: (it.server_ids || []).filter((s) => s !== server_id) };
      return it;
    }).filter((it) => !(it.type === "server" && it.server_id === server_id));
    return next;
  };

  const cleanupFolders = (items) => items.filter((it) => {
    if (it.type !== "folder") return true;
    const arr = it.server_ids || [];
    if (arr.length === 0) return false;
    return true;
  }).map((it) => {
    // If folder has only 1 server, ungroup it (replace with a server item at same index)
    if (it.type === "folder" && (it.server_ids || []).length === 1) {
      return { type: "server", server_id: it.server_ids[0] };
    }
    return it;
  });

  const handleDragStart = (e) => {
    const { active } = e;
    setActiveDrag(active.data.current);
  };

  const handleDragEnd = (e) => {
    const { active, over } = e;
    setActiveDrag(null);
    if (!over) return;
    const ad = active.data.current;
    const od = over.data.current;
    if (!ad || !od) return;

    let next = layout.items.slice();

    // Dragging a SERVER
    if (ad.kind === "server") {
      const sid = ad.server_id;
      // Drop on folder (folder-drop droppable)
      if (od.kind === "folder-drop") {
        const fid = od.folder_id;
        next = removeServer(next, sid);
        next = next.map((it) => it.type === "folder" && it.folder_id === fid ? { ...it, server_ids: [...(it.server_ids || []), sid] } : it);
        next = cleanupFolders(next);
        persistLayout({ items: next });
        return;
      }
      // Drop on another server → create folder containing both (only if at top level)
      if (od.kind === "server" && od.server_id !== sid) {
        const targetSid = od.server_id;
        const targetTop = next.findIndex((it) => it.type === "server" && it.server_id === targetSid);
        if (targetTop >= 0) {
          // Both must be at top level for creating a folder
          const sourceTop = next.findIndex((it) => it.type === "server" && it.server_id === sid);
          if (sourceTop >= 0) {
            // create folder
            const folder = {
              type: "folder",
              folder_id: `fld_${Math.random().toString(36).slice(2, 10)}`,
              name: "Dossier",
              color: "#FF3B00",
              collapsed: false,
              server_ids: [targetSid, sid],
            };
            next = next.filter((it) => !(it.type === "server" && (it.server_id === sid || it.server_id === targetSid)));
            // insert folder where target was
            const idx = next.findIndex((it) => it.type === "server" && it.server_id === targetSid);
            next.splice(targetTop, 0, folder);
            next = cleanupFolders(next);
            persistLayout({ items: next });
            return;
          }
        }
        // If reordering within a folder (both inside same folder), arrayMove inside that folder
        const findIn = findServerInLayout(next, sid);
        const findOver = findServerInLayout(next, targetSid);
        if (findIn && findOver && findIn.topIndex === findOver.topIndex && next[findIn.topIndex].type === "folder") {
          const f = next[findIn.topIndex];
          const newIds = arrayMove(f.server_ids, findIn.folderIndex, findOver.folderIndex);
          next[findIn.topIndex] = { ...f, server_ids: newIds };
          persistLayout({ items: next });
          return;
        }
        // Otherwise: move source server to top-level just before target server
        next = removeServer(next, sid);
        const ti = next.findIndex((it) => it.type === "server" && it.server_id === targetSid);
        if (ti >= 0) {
          next.splice(ti, 0, { type: "server", server_id: sid });
        } else {
          next.push({ type: "server", server_id: sid });
        }
        next = cleanupFolders(next);
        persistLayout({ items: next });
        return;
      }
      // Drop on folder item (the folder tile itself, not its drop zone): also add to folder
      if (od.kind === "folder") {
        const fid = od.folder_id;
        next = removeServer(next, sid);
        next = next.map((it) => it.type === "folder" && it.folder_id === fid ? { ...it, server_ids: [...(it.server_ids || []), sid] } : it);
        next = cleanupFolders(next);
        persistLayout({ items: next });
        return;
      }
    }

    // Dragging a FOLDER over another item: reorder folders/items
    if (ad.kind === "folder" && od.kind !== "folder-drop") {
      const fromId = active.id;
      const toId = over.id;
      const fromIdx = next.findIndex((it) => (it.type === "folder" ? `folder:${it.folder_id}` : `server:${it.server_id}`) === fromId);
      const toIdx = next.findIndex((it) => (it.type === "folder" ? `folder:${it.folder_id}` : `server:${it.server_id}`) === toId);
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
        next = arrayMove(next, fromIdx, toIdx);
        persistLayout({ items: next });
      }
    }
  };

  const renameFolder = (folder_id, name, color) => {
    const next = layout.items.map((it) => it.type === "folder" && it.folder_id === folder_id ? { ...it, name, color } : it);
    persistLayout({ items: next });
  };
  const ungroupFolder = (folder_id) => {
    const f = layout.items.find((it) => it.type === "folder" && it.folder_id === folder_id);
    if (!f) return;
    const next = [];
    for (const it of layout.items) {
      if (it.type === "folder" && it.folder_id === folder_id) {
        for (const sid of (it.server_ids || [])) next.push({ type: "server", server_id: sid });
      } else next.push(it);
    }
    persistLayout({ items: next });
  };
  const toggleExpand = (folder_id) => setExpanded((e) => ({ ...e, [folder_id]: !e[folder_id] }));

  // Build flat list of sortable IDs for top-level
  const topIds = layout.items.map((it) => it.type === "folder" ? `folder:${it.folder_id}` : `server:${it.server_id}`);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <aside
        className={cn(
          "bg-cc-base border-r border-cc-border flex flex-col items-center py-5 gap-3 shrink-0 w-20 transition-transform duration-300 ease-out",
          isMobile ? "fixed inset-y-0 left-0 z-40 h-[100dvh]" : "",
          isMobile && !drawerOpen ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <RailButton active={homeActive} onClick={() => go("/app/me")} label="Messages privés" testId="rail-home">
          <MessageSquare className="w-5 h-5" />
        </RailButton>
        <div className="cc-divider w-10" />
        <div className="flex-1 overflow-y-auto w-full flex flex-col items-center gap-3 no-scrollbar px-1">
          <SortableContext items={topIds} strategy={verticalListSortingStrategy}>
            {layout.items.map((it) => {
              if (it.type === "server") {
                const s = serversById[it.server_id];
                if (!s) return null;
                return (
                  <SortableServer
                    key={`s-${s.server_id}`}
                    server={s}
                    active={s.server_id === serverId}
                    badge={unread[s.server_id] || 0}
                    onClick={() => go(`/app/servers/${s.server_id}`, s.server_id)}
                  />
                );
              }
              return (
                <SortableFolder
                  key={`f-${it.folder_id}`}
                  folder={it}
                  serversById={serversById}
                  expanded={!!expanded[it.folder_id]}
                  unread={unread}
                  activeServerId={serverId}
                  onToggle={() => toggleExpand(it.folder_id)}
                  onRename={(name, color) => renameFolder(it.folder_id, name, color)}
                  onUngroup={() => ungroupFolder(it.folder_id)}
                  onPickServer={(sid) => go(`/app/servers/${sid}`, sid)}
                />
              );
            })}
          </SortableContext>
          <RailButton onClick={onCreate} label="Créer un serveur" testId="rail-create">
            <Plus className="w-5 h-5" />
          </RailButton>
          <RailButton active={discoverActive} onClick={() => go("/app/discover")} label="Découvrir des serveurs" testId="rail-discover">
            <Compass className="w-5 h-5" />
          </RailButton>
        </div>
        <RailButton active={settingsActive} onClick={() => go("/app/settings")} label="Paramètres" testId="rail-settings">
          <SettingsIcon className="w-5 h-5" />
        </RailButton>
      </aside>
      <DragOverlay>
        {activeDrag?.kind === "server" && serversById[activeDrag.server_id] ? (
          <div className="w-12 h-12 bg-cc-accent border border-transparent rounded-sm flex items-center justify-center text-cc-text shadow-2xl">
            {serversById[activeDrag.server_id].icon_url ? (
              <img src={serversById[activeDrag.server_id].icon_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-extrabold text-base">{initials(serversById[activeDrag.server_id].name)}</span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
