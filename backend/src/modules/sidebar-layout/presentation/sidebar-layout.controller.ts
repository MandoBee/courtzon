import type { FastifyRequest, FastifyReply } from 'fastify';
import { sidebarLayoutService } from '../application/sidebar-layout.service.js';

export async function getLayoutHandler(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req as any).userId;
  const layout = await sidebarLayoutService.getLayout(userId);
  return reply.send({ data: layout });
}

export async function saveLayoutHandler(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req as any).userId;
  const { layout } = req.body as { layout: { parentKey: string | null; orderedKeys: string[] }[] };
  await sidebarLayoutService.saveLayout(userId, layout);
  return reply.send({ data: { success: true } });
}
