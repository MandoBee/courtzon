import type { FastifyRequest, FastifyReply } from 'fastify';
import { translationsService } from '../application/translations.service.js';
import {
  CreateTranslationSchema,
  UpdateTranslationSchema,
  UpsertTranslationSchema,
  ListTranslationsQuerySchema,
  GridQuerySchema,
  LocalePackSchema,
} from './translations.dto.js';

export async function getPublicTranslationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { locale } = request.params as { locale: string };
  const bundle = await translationsService.getPublicBundle(locale);
  return reply.send({ data: bundle });
}

export async function listTranslationsGridHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = GridQuerySchema.parse(request.query);
  const result = await translationsService.getGrid(query);
  return reply.send(result);
}

export async function syncTranslationKeysHandler(_request: FastifyRequest, reply: FastifyReply) {
  const result = await translationsService.syncKeysFromRegistry();
  return reply.send({ data: result });
}

export async function createLocalePackHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = LocalePackSchema.parse(request.body);
  const result = await translationsService.createLocalePack(body.locale);
  return reply.status(201).send({ data: result });
}

export async function syncLocalePackHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = LocalePackSchema.parse(request.body);
  const result = await translationsService.syncMissingKeysForLocale(body.locale);
  return reply.send({ data: result });
}

export async function getLocalePackHandler(request: FastifyRequest, reply: FastifyReply) {
  const { locale } = request.params as { locale: string };
  const rows = await translationsService.getLocalePack(locale);
  return reply.send({ data: rows });
}

export async function listTranslationModulesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const modules = await translationsService.listModules();
  return reply.send({ data: modules });
}

export async function listTranslationElementTypesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const types = await translationsService.listElementTypes();
  return reply.send({ data: types });
}

export async function listTranslationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = ListTranslationsQuerySchema.parse(request.query);
  const translations = await translationsService.list(query.locale, query.search);
  return reply.send({ data: translations });
}

export async function getTranslationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const t = await translationsService.getById(Number(id));
  return reply.send(t);
}

export async function createTranslationHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateTranslationSchema.parse(request.body);
  const t = await translationsService.create(body);
  return reply.status(201).send(t);
}

export async function upsertTranslationHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = UpsertTranslationSchema.parse(request.body);
  const t = await translationsService.upsert(body);
  return reply.send(t);
}

export async function updateTranslationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const body = UpdateTranslationSchema.parse(request.body);
  const t = await translationsService.update(Number(id), body);
  return reply.send(t);
}

export async function deleteTranslationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  await translationsService.delete(Number(id));
  return reply.status(204).send();
}

export async function listLocalesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const locales = await translationsService.listLocales();
  return reply.send({ data: locales });
}

export async function listKeysHandler(_request: FastifyRequest, reply: FastifyReply) {
  const keys = await translationsService.listKeys();
  return reply.send({ data: keys });
}

export async function exportTranslationsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const all = await translationsService.exportAll();
  return reply.send({ data: all });
}
