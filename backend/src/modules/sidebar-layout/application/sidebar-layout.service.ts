import { SidebarLayoutRepository } from '../infrastructure/repositories/sidebar-layout.repository.js';

const repo = new SidebarLayoutRepository();

export const sidebarLayoutService = {
  getLayout: (userId: number) => repo.findByUser(userId),

  saveLayout: (userId: number, layout: { parentKey: string | null; orderedKeys: string[] }[]) =>
    Promise.all(layout.map((l) => repo.upsert(userId, l.parentKey, l.orderedKeys))),
};
