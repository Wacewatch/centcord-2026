import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Sortable channel list — handles drag-and-drop reordering of channels within
 * a single category. Cross-category moves are handled via the channel context
 * menu in the parent component (Move to category…).
 *
 * Props:
 *   - items: array of channel objects [{ channel_id, name, type, ... }]
 *   - onReorder: (orderedChannelIds: string[]) => Promise<void>
 *   - renderItem: (channel, dragHandleProps) => ReactNode
 *   - dragDisabled: boolean
 */
export default function SortableChannelList({ items, onReorder, renderItem, dragDisabled }) {
  const [list, setList] = useState(items);
  const [activeId, setActiveId] = useState(null);

  // Keep local list in sync when prop items change
  React.useEffect(() => { setList(items); }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // require small drag before activating to avoid eating clicks
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event) => setActiveId(event.active.id);
  const handleDragCancel = () => setActiveId(null);
  const handleDragEnd = async (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((c) => c.channel_id === active.id);
    const newIndex = list.findIndex((c) => c.channel_id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    setList(next);
    try {
      await onReorder(next.map((c) => c.channel_id));
    } catch (_) {
      // Revert on failure
      setList(list);
    }
  };

  if (dragDisabled) {
    return <>{list.map((c) => renderItem(c, {}))}</>;
  }

  const activeChannel = activeId ? list.find((c) => c.channel_id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={list.map((c) => c.channel_id)} strategy={verticalListSortingStrategy}>
        {list.map((c) => (
          <SortableItem key={c.channel_id} id={c.channel_id} channel={c} renderItem={renderItem} />
        ))}
      </SortableContext>
      <DragOverlay>
        {activeChannel ? (
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg px-3 py-1.5 text-sm shadow-2xl pointer-events-none">
            <span className="opacity-80"># {activeChannel.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableItem({ id, channel, renderItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  // Provide a small grip handle that the user grabs; rest of the item stays clickable.
  const handle = (
    <span
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab active:cursor-grabbing flex items-center justify-center w-4 h-4 text-cc-muted/50 hover:text-cc-text shrink-0",
        "opacity-0 group-hover:opacity-100 transition-opacity"
      )}
      onClick={(e) => e.stopPropagation()}
      aria-label="Glisser pour réordonner"
      data-testid={`drag-handle-${id}`}
    >
      <GripVertical className="w-3.5 h-3.5" />
    </span>
  );
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      {renderItem(channel, { handle })}
    </div>
  );
}
