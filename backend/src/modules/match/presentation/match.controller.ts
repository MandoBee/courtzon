import type { FastifyRequest, FastifyReply } from 'fastify';

export async function getMatchesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ data: [] });
}

export async function getMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ data: null });
}

export async function joinMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.status(201).send({ data: null });
}

export async function withdrawJoinHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ success: true });
}

export async function getApplicantsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ data: { joinRequests: [], participants: [] } });
}

export async function approveApplicantHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ success: true });
}

export async function rejectApplicantHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ success: true });
}

export async function closeMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ success: true });
}

export async function cancelMatchHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  void request;
  reply.send({ success: true });
}
