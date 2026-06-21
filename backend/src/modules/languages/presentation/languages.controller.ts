import type { FastifyRequest, FastifyReply } from 'fastify';
import { languagesService } from '../application/languages.service.js';
import { CreateLanguageSchema, UpdateLanguageSchema } from './languages.dto.js';

export async function listLanguagesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const languages = await languagesService.listAll();
  return reply.send({ data: languages });
}

export async function listPublicLanguagesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const languages = await languagesService.list();
  return reply.send({
    data: languages.map((lang: any) => ({
      id: lang.id,
      code: lang.code,
      name: lang.name,
      native_name: lang.native_name,
      isRtl: !!lang.is_rtl,
    })),
  });
}

export async function getLanguageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const lang = await languagesService.getById(Number(id));
  return reply.send(lang);
}

export async function createLanguageHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateLanguageSchema.parse(request.body);
  const lang = await languagesService.create(body);
  return reply.status(201).send(lang);
}

export async function updateLanguageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateLanguageSchema.parse(request.body);
  const lang = await languagesService.update(Number(id), body);
  return reply.send(lang);
}

export async function deleteLanguageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await languagesService.delete(Number(id));
  return reply.status(204).send();
}
