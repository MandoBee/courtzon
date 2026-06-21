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
import api from '../../../services/api';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  permissionKey: string;
  requiredFlag?: string;
  children?: NavItem[];
}

function buildSections() {
  const allItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', path: '/admin', permissionKey: 'sidebar.dashboard' },
    { label: 'Reports', icon: '📈', path: '/admin/reports', permissionKey: 'sidebar.reports' },
    {
      label: 'Organisations', icon: '🏢', path: '/admin/organisations', permissionKey: 'sidebar.organisations',
      children: [
        { label: 'All Organisations', icon: '🏢', path: '/admin/organisations', permissionKey: 'sidebar.organisations' },
        { label: 'Branch Access', icon: '🔑', path: '/admin/branch-access', permissionKey: 'sidebar.branch-access' },
        { label: 'All Bookings', icon: '📅', path: '/admin/bookings', permissionKey: 'sidebar.admin-bookings' },
        { label: 'Subscription Plans', icon: '📋', path: '/admin/subscription', permissionKey: 'sidebar.subscription' },
        { label: 'Types', icon: '🏷️', path: '/admin/organisation-types', permissionKey: 'sidebar.organisation-types' },
        { label: 'Settlements', icon: '💰', path: '/admin/settlements', permissionKey: 'sidebar.settlements' },
      ],
    },
    {
      label: 'Roles & Permissions', icon: '🔐', path: '/admin/roles', permissionKey: 'sidebar.roles',
      children: [
        { label: 'All Roles', icon: '🔐', path: '/admin/roles', permissionKey: 'sidebar.roles' },
        { label: 'Permissions', icon: '🔑', path: '/admin/permissions', permissionKey: 'sidebar.permissions' },
      ],
    },
    {
      label: 'Marketplace', icon: '🛒', path: '/admin/product-categories', permissionKey: 'sidebar.marketplace', requiredFlag: 'app.marketplace_enabled',
      children: [
        { label: 'Products', icon: '📦', path: '/admin/marketplace/products', permissionKey: 'sidebar.marketplace-products' },
        { label: 'Orders', icon: '📋', path: '/admin/marketplace/orders', permissionKey: 'sidebar.marketplace-orders' },
        { label: 'Sellers', icon: '👤', path: '/admin/marketplace/sellers', permissionKey: 'sidebar.marketplace-sellers' },
        { label: 'Product Categories', icon: '📂', path: '/admin/product-categories', permissionKey: 'sidebar.product-categories' },
        { label: 'Registrations', icon: '📝', path: '/admin/approvals', permissionKey: 'sidebar.marketplace-approvals' },
        { label: 'Reviews', icon: '⭐', path: '/admin/marketplace/reviews', permissionKey: 'sidebar.marketplace-reviews' },
        { label: 'Brands', icon: '🏷️', path: '/admin/brands', permissionKey: 'sidebar.brands' },
        { label: 'Tags', icon: '🔖', path: '/admin/tags', permissionKey: 'sidebar.tags' },
      ],
    },
    { label: 'Tournaments', icon: '🏆', path: '/admin/tournaments', permissionKey: 'sidebar.tournaments-admin' },
    { label: 'Academies', icon: '🎓', path: '/admin/academies', permissionKey: 'sidebar.academies-admin' },
    { label: 'Coaches', icon: '👨‍🏫', path: '/admin/coaches', permissionKey: 'sidebar.coaches-admin' },
    { label: 'Community Events', icon: '🎉', path: '/admin/community-events', permissionKey: 'sidebar.community-admin' },
    { label: 'Ads', icon: '📢', path: '/admin/ads', permissionKey: 'sidebar.ads', requiredFlag: 'community.events_enabled' },
    {
      label: 'Admin Settings', icon: '⚙️', path: '/admin/sports', permissionKey: 'sidebar.admin-settings',
      children: [
        { label: 'Sports', icon: '🏅', path: '/admin/sports', permissionKey: 'sidebar.sports' },
        {
          label: 'Finance', icon: '💰', path: '/admin/withdrawal-requests', permissionKey: 'sidebar.finance',
          children: [
            { label: 'Withdrawal Requests', icon: '💸', path: '/admin/withdrawal-requests', permissionKey: 'sidebar.withdrawal-requests' },
            { label: 'Coupons', icon: '🏷️', path: '/admin/coupons', permissionKey: 'sidebar.coupons' },
            { label: 'Banks', icon: '🏦', path: '/admin/banks', permissionKey: 'sidebar.banks' },
            { label: 'Bank Branches', icon: '🏧', path: '/admin/bank-branches', permissionKey: 'sidebar.bank-branches' },
          ],
        },
        {
          label: 'Payments Config', icon: '💳', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods',
          children: [
            { label: 'Payment Methods', icon: '💳', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods' },
            { label: 'Gateway Config', icon: '🔌', path: '/admin/payment-gateways', permissionKey: 'sidebar.payment-gateways' },
          ],
        },
        {
          label: 'Localization', icon: '🌍', path: '/admin/countries', permissionKey: 'sidebar.countries',
          children: [
            { label: 'Countries', icon: '🌍', path: '/admin/countries', permissionKey: 'sidebar.countries' },
            { label: 'Currencies', icon: '💱', path: '/admin/currencies', permissionKey: 'sidebar.currencies' },
            { label: 'Languages', icon: '🔤', path: '/admin/languages', permissionKey: 'sidebar.languages' },
            { label: 'Translations', icon: '🌐', path: '/admin/translations', permissionKey: 'sidebar.translations' },
          ],
        },
        { label: 'Amenities', icon: '🏟️', path: '/admin/amenities', permissionKey: 'sidebar.amenities' },
        {
          label: 'App Settings', icon: '⚙️', path: '/admin/sidebar-layout', permissionKey: 'sidebar.app-settings-menu',
          children: [
            { label: 'Set Sidebar Layout', icon: '📐', path: '/admin/sidebar-layout', permissionKey: 'sidebar.layout.manage' },
            { label: 'Branding', icon: '🎨', path: '/admin/app-settings', permissionKey: 'sidebar.app-settings' },
            { label: 'Appearance Studio', icon: '✨', path: '/admin/design-tokens', permissionKey: 'sidebar.design-tokens' },
            { label: 'CMS', icon: '📝', path: '/admin/cms', permissionKey: 'sidebar.cms' },
          ],
        },
      ],
    },
    { label: 'Users', icon: '👥', path: '/admin/users', permissionKey: 'sidebar.users' },
    {
      label: 'Security', icon: '🛡️', path: '/admin/security', permissionKey: 'sidebar.security-dashboard',
      children: [
        { label: 'Security Dashboard', icon: '🛡️', path: '/admin/security', permissionKey: 'sidebar.security-dashboard' },
        { label: 'Active Sessions', icon: '🔵', path: '/admin/security/sessions', permissionKey: 'sidebar.active-sessions' },
        { label: 'Failed Logins', icon: '❌', path: '/admin/security/failed-logins', permissionKey: 'sidebar.failed-logins' },
        { label: 'Upload Security', icon: '📎', path: '/admin/security/uploads', permissionKey: 'sidebar.upload-security' },
        { label: 'System Health', icon: '💚', path: '/admin/security/system-health', permissionKey: 'sidebar.system-health' },
        { label: 'Audit Log', icon: '📋', path: '/admin/audit-logs', permissionKey: 'sidebar.audit' },
        { label: 'Feature Flags', icon: '🚩', path: '/admin/feature-flags', permissionKey: 'sidebar.feature-flags' },
      ],
    },
  ];
  return allItems;
}

interface DisplayItem {
  permissionKey: string;
  label: string;
  icon: string;
}

function buildItemMap(items: NavItem[]): Map<string, DisplayItem> {
  const map = new Map<string, DisplayItem>();
  function walk(list: NavItem[]) {
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

function buildContainerKeys(items: NavItem[]): Set<string> {
  const keys = new Set<string>();
  function walk(list: NavItem[]) {
    for (const it of list) {
      if (it.children && it.children.length > 0) {
        keys.add(it.permissionKey);
        walk(it.children);
      }
    }
  }
  walk(items);
  return keys;
}

function buildDefaultContainers(items: NavItem[]): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>();
  function walk(list: NavItem[], parentKey: string | null) {
    const keys = list.map((it: any) => it.permissionKey);
    map.set(parentKey, keys);
    for (const it of list) {
      if (it.children && it.children.length > 0) {
        walk(it.children, it.permissionKey);
      }
    }
  }
  walk(items, null);
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

  const allItems = useMemo(() => buildSections(), []);
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
    const map = new Map<string | null, string[]>();
    for (const entry of layoutData.data) {
      const existing = (entry.orderedKeys as string[]).filter((k: any) => itemMap.has(k));
      if (existing.length) map.set(entry.parentKey, existing);
    }
    if (map.size === 0) return;
    setContainers((prev) => {
      const next = new Map<string | null, string[]>(prev);
      for (const [parentKey, savedKeys] of map) {
        const defaults = prev.get(parentKey) ?? [];
        const seen = new Set<string>();
        const ordered = savedKeys.filter((k: string) => defaults.includes(k) && !seen.has(k) && !!seen.add(k));
        const remaining = defaults.filter((k) => !savedKeys.includes(k));
        next.set(parentKey, [...ordered, ...remaining]);
      }
      return next;
    });
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
      const layout = Array.from(containers.entries()).map(([parentKey, orderedKeys]) => ({
        parentKey,
        orderedKeys,
      }));
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
