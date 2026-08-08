import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '../../../components/ui/Toast';
import { useTranslation } from '../../../i18n';
import {
  resolveWorkspaceNav,
  buildContainerKeys,
  buildDefaultContainers,
  serializeContainers,
  mergeSavedLayout,
  type WorkspaceNode,
} from '../../../navigation';
import api from '../../../services/api';

interface DisplayItem {
  permissionKey: string;
  label: string;
  icon: string;
}

function buildItemMap(items: WorkspaceNode[]): Map<string, DisplayItem> {
  const map = new Map<string, DisplayItem>();
  function walk(list: WorkspaceNode[]) {
    for (const it of list) {
      if (!map.has(it.permissionKey)) {
        map.set(it.permissionKey, { permissionKey: it.permissionKey, label: it.label, icon: it.icon });
      }
      if (it.children) walk(it.children);
    }
  }
  walk(items);
  return map;
}

function scopedId(containerKey: string | null, id: string): string {
  return `${containerKey ?? '__root'}::${id}`;
}

function unscoped(id: string): string {
  const idx = id.indexOf('::');
  return idx === -1 ? id : id.slice(idx + 2);
}

function containerFromScopedId(id: string): string | null {
  const idx = id.indexOf('::');
  if (idx === -1) return null;
  const prefix = id.slice(0, idx);
  return prefix === '__root' ? null : prefix;
}

function dropZoneId(containerKey: string | null): string {
  return `__drop__:${containerKey ?? '__root'}`;
}

function containerFromDropZone(id: string): string | null {
  if (!id.startsWith('__drop__:')) return null;
  const key = id.slice(9);
  return key === '__root' ? null : key;
}

function DropZone({ containerKey }: { containerKey: string | null }) {
  const dzId = dropZoneId(containerKey);
  const { setNodeRef, isOver } = useDroppable({ id: dzId });

  return (
    <div
      ref={setNodeRef}
      className={`h-2 mx-2 rounded transition-colors ${isOver ? 'bg-[var(--color-primary)]/10 border border-dashed border-[var(--color-primary)]/30' : ''}`}
    />
  );
}

function SortableLeafItem({ item, scope }: { item: DisplayItem; scope: string | null }) {
  const dndId = scopedId(scope, item.permissionKey);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dndId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-center gap-3 px-4 py-2.5 border border-[var(--color-border)] rounded-[var(--radius-md)] cursor-grab hover:border-[var(--color-primary)]/40 transition-colors"
    >
      <span className="text-base shrink-0">{item.icon}</span>
      <span className="text-sm font-medium text-[var(--color-text)] truncate">{item.label}</span>
      <span className="ml-auto text-[10px] text-[var(--color-text-muted)] shrink-0 hidden sm:inline">{item.permissionKey}</span>
    </div>
  );
}

function GroupItem({
  item,
  children,
}: {
  item: DisplayItem;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] overflow-hidden mb-2"
    >
      <div
        className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg)] bg-[var(--color-surface)]/60 flex items-center gap-2"
      >
        <span className="text-base">{item.icon}</span>
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{item.label}</h3>
        <span className="ml-auto text-[10px] text-[var(--color-text-muted)] shrink-0">{item.permissionKey}</span>
      </div>
      <div className="py-1 space-y-1">
        {children}
      </div>
    </div>
  );
}

function ContainerNode({
  containerKey,
  depth,
  containers,
  containerKeys,
  itemMap,
}: {
  containerKey: string | null;
  depth: number;
  containers: Map<string | null, string[]>;
  containerKeys: Set<string>;
  itemMap: Map<string, DisplayItem>;
}) {
  const itemIds = containers.get(containerKey) ?? [];

  if (itemIds.length === 0) return null;

  return (
    <SortableContext items={itemIds.map((id: any) => scopedId(containerKey, id))} strategy={verticalListSortingStrategy}>
      <div style={{ marginLeft: depth * 20 }} className="space-y-1">
        {itemIds.map((id: any) => {
          const item = itemMap.get(id);
          if (!item) return null;

          if (containerKeys.has(id) && id !== containerKey) {
            return (
              <GroupItem key={id} item={item}>
                <ContainerNode
                  containerKey={id}
                  depth={depth + 1}
                  containers={containers}
                  containerKeys={containerKeys}
                  itemMap={itemMap}
                />
              </GroupItem>
            );
          }

          return (
            <div key={id}>
              <SortableLeafItem item={item} scope={containerKey} />
            </div>
          );
        })}
        <DropZone containerKey={containerKey} />
      </div>
    </SortableContext>
  );
}

export default function SidebarLayoutPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const { t } = useTranslation();

  const allItems = useMemo(() => resolveWorkspaceNav(t), [t]);
  const itemMap = useMemo(() => buildItemMap(allItems), [allItems]);
  const containerKeys = useMemo(() => buildContainerKeys(allItems), [allItems]);
  const defaultContainers = useMemo(() => buildDefaultContainers(allItems), [allItems]);

  const [containers, setContainers] = useState<Map<string | null, string[]>>(() => new Map(defaultContainers));
  const hasLoaded = useRef(false);

  const { data: layoutData } = useQuery({
    queryKey: ['sidebar-layout'],
    queryFn: () => api.get('/sidebar/layout').then((r: any) => r.data),
  });

  useEffect(() => {
    if (hasLoaded.current) return;
    if (!layoutData?.data?.length) return;
    hasLoaded.current = true;
    const validKeys = new Set(itemMap.keys());
    setContainers((prev) => mergeSavedLayout(prev, layoutData.data, validKeys));
  }, [layoutData, itemMap, defaultContainers]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(unscoped(event.active.id as string));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeIdStr = unscoped(active.id as string);
    const activeContainer = containerFromScopedId(active.id as string);

    const overDropContainer = containerFromDropZone(over.id as string);
    if (overDropContainer !== null) {
      // Drop zone: only allow dropping into the same container
      if (activeContainer !== overDropContainer) return;
      setContainers((prev) => {
        const next = new Map<string | null, string[]>(prev);
        const items = [...(next.get(activeContainer) ?? [])];
        const fromIndex = items.indexOf(activeIdStr);
        if (fromIndex === -1) return prev;
        const [moved] = items.splice(fromIndex, 1);
        items.push(moved);
        next.set(activeContainer, items);
        return next;
      });
      return;
    }

    const overIdStr = unscoped(over.id as string);
    if (activeIdStr === overIdStr) return;
    const overContainer = containerFromScopedId(over.id as string);

    // Only allow reordering within the same container
    if (activeContainer !== overContainer) return;

    if (activeContainer === overContainer) {
      setContainers((prev) => {
        const next = new Map<string | null, string[]>(prev);
        const items = [...(next.get(activeContainer) ?? [])];
        const oldIndex = items.indexOf(activeIdStr);
        const newIndex = items.indexOf(overIdStr);
        if (oldIndex === -1 || newIndex === -1) return prev;
        next.set(activeContainer, arrayMove(items, oldIndex, newIndex));
        return next;
      });
    }
  };

  const handleSave = async () => {
    try {
      const layout = serializeContainers(containers);
      await api.put('/sidebar/layout', { layout });
      queryClient.invalidateQueries({ queryKey: ['sidebar-layout'] });
      showToast('Sidebar layout saved');
    } catch {
      showToast('Failed to save layout', 'error');
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">Sidebar Layout</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Drag items between sections to reorganize. Changes apply after saving.
            </p>
          </div>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Save Layout
          </button>
        </div>

        <ContainerNode
          containerKey={null}
          depth={0}
          containers={containers}
          containerKeys={containerKeys}
          itemMap={itemMap}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div className="flex items-center gap-3 px-4 py-2.5 border-2 border-[var(--color-primary)] rounded-[var(--radius-md)] shadow-lg">
            <span className="text-base">{itemMap.get(activeId)?.icon ?? '📄'}</span>
            <span className="text-sm font-medium text-[var(--color-text)]">
              {itemMap.get(activeId)?.label ?? activeId}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
