import type { FastifyRequest, FastifyReply } from 'fastify';
import { communityService as svc } from '../application/community.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { CreateEventSchema, RsvpSchema, SendMessageSchema, CreateCampaignSchema, AuditQuerySchema, RevertSchema, CreateGroupSchema, InviteToGroupSchema, RespondToInvitationSchema, UpdateGroupSchema, RemoveMemberSchema } from './community.dto.js';

// ── Follows ──
export async function followHandler(request: FastifyRequest, reply: FastifyReply) {
  const { followingId } = request.params as any;
  const userId = (request as any).userId;
  await svc.follow(userId, Number(followingId));
  return reply.status(201).send({ message: 'Followed' });
}
export async function unfollowHandler(request: FastifyRequest, reply: FastifyReply) {
  const { followingId } = request.params as any;
  const userId = (request as any).userId;
  await svc.unfollow(userId, Number(followingId));
  return reply.send({ message: 'Unfollowed' });
}
export async function getFollowersHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const followers = await svc.getFollowers(userId);
  return reply.send({ data: followers });
}
export async function getFollowingHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const following = await svc.getFollowing(userId);
  return reply.send({ data: following });
}

// ── Friends ──
export async function sendFriendRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { addresseeId } = request.params as any;
  const userId = (request as any).userId;
  await svc.sendFriendRequest(userId, Number(addresseeId));
  return reply.status(201).send({ message: 'Request sent' });
}
export async function acceptFriendRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { requesterId } = request.params as any;
  const userId = (request as any).userId;
  await svc.acceptFriendRequest(Number(requesterId), userId);
  return reply.send({ message: 'Friend request accepted' });
}
export async function getFriendsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const friends = await svc.getFriends(userId);
  return reply.send({ data: friends });
}

// ── Events ──
export async function listEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit } = request.query as any;
  const events = await svc.listEvents(Number(page) || 1, Number(limit) || 20);
  return reply.send({ data: events });
}
export async function getEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const event = await svc.getEvent(Number(id));
  return reply.send(event);
}
export async function createEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateEventSchema.parse(request.body);
  const userId = (request as any).userId;
  const event = await svc.createEvent(userId, body);
  return reply.status(201).send(event);
}
export async function rsvpEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RsvpSchema.parse(request.body);
  const userId = (request as any).userId;
  await svc.rsvpEvent(Number(id), userId, body.status);
  return reply.send({ message: 'RSVP updated' });
}

// ── Chat ──
export async function getOrCreateConversationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { otherUserId } = request.params as any;
  const userId = (request as any).userId;
  const convoId = await svc.getOrCreateConversation(userId, Number(otherUserId));
  return reply.send({ conversationId: convoId });
}
export async function getOrCreateConversationByPhoneHandler(request: FastifyRequest, reply: FastifyReply) {
  const { phone } = request.params as any;
  const userId = (request as any).userId;
  const convoId = await svc.getOrCreateConversationByPhone(userId, phone);
  return reply.send({ conversationId: convoId });
}
export async function lookupUserByPhoneHandler(request: FastifyRequest, reply: FastifyReply) {
  const { phone } = request.params as any;
  const user = await svc.lookupUserByPhone(phone);
  return reply.send({ data: user });
}
export async function getConversationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const conversations = await svc.getConversations(userId);
  return reply.send({ data: conversations });
}
export async function sendMessageHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const body = SendMessageSchema.parse(request.body);
  const userId = (request as any).userId;
  const cid = Number(conversationId);
  await svc.sendMessage(cid, userId, body.content);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.MESSAGE_SEND',
    entityType: 'conversation',
    entityId: cid,
    afterState: { contentLength: body.content.length },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ message: 'Sent' });
}
export async function getMessagesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const { page, limit } = request.query as any;
  const userId = (request as any).userId;
  const messages = await svc.getMessages(Number(conversationId), userId, Number(page) || 1, Number(limit) || 50);
  return reply.send({ data: messages });
}

// ── Group Chat ──
export async function createGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateGroupSchema.parse(request.body);
  const userId = (request as any).userId;
  const conversationId = await svc.createGroup(userId, body.name, body.avatarUrl, body.inviteeIds);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_CREATE',
    entityType: 'conversation',
    entityId: conversationId,
    afterState: { name: body.name, inviteeCount: body.inviteeIds.length },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ conversationId });
}

export async function inviteToGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const body = InviteToGroupSchema.parse(request.body);
  const userId = (request as any).userId;
  await svc.inviteToGroup(Number(conversationId), userId, body.inviteeId);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_INVITE',
    entityType: 'conversation',
    entityId: Number(conversationId),
    afterState: { inviteeId: body.inviteeId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ message: 'Invitation sent' });
}

export async function getGroupInvitationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const invitations = await svc.getGroupInvitations(userId);
  return reply.send({ data: invitations });
}

export async function respondToInvitationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { invitationId } = request.params as any;
  const body = RespondToInvitationSchema.parse(request.body);
  const userId = (request as any).userId;
  await svc.respondToInvitation(Number(invitationId), userId, body.status);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_INVITATION_RESPOND',
    entityType: 'group_invitation',
    entityId: Number(invitationId),
    afterState: { status: body.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ message: `Invitation ${body.status}` });
}

// ── Group Management ──
export async function getGroupMembersHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  const members = await svc.getGroupMembers(Number(conversationId), userId);
  return reply.send({ data: members });
}

export async function getGroupInfoHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  const info = await svc.getGroupInfo(Number(conversationId), userId);
  return reply.send(info);
}

export async function updateGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const body = UpdateGroupSchema.parse(request.body);
  const userId = (request as any).userId;
  const updated = await svc.updateGroup(Number(conversationId), userId, body);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_UPDATE',
    entityType: 'conversation',
    entityId: Number(conversationId),
    afterState: body,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(updated);
}

export async function removeMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const body = RemoveMemberSchema.parse(request.body);
  const userId = (request as any).userId;
  await svc.removeMember(Number(conversationId), userId, body.targetUserId);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_MEMBER_REMOVE',
    entityType: 'conversation',
    entityId: Number(conversationId),
    afterState: { removedUserId: body.targetUserId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ message: 'Member removed' });
}

export async function leaveGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  await svc.leaveGroup(Number(conversationId), userId);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_LEAVE',
    entityType: 'conversation',
    entityId: Number(conversationId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ message: 'Left group' });
}

export async function deleteGroupHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  await svc.deleteGroup(Number(conversationId), userId);
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_DELETE',
    entityType: 'conversation',
    entityId: Number(conversationId),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}

export async function getPendingInvitationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  const invitations = await svc.getPendingInvitations(Number(conversationId), userId);
  return reply.send({ data: invitations });
}

export async function cancelInvitationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId, invitationId } = request.params as any;
  const userId = (request as any).userId;
  await svc.cancelInvitation(Number(conversationId), userId, Number(invitationId));
  return reply.send({ message: 'Invitation cancelled' });
}

export async function promoteAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId, targetUserId } = request.params as any;
  const userId = (request as any).userId;
  await svc.promoteAdmin(Number(conversationId), userId, Number(targetUserId));
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_PROMOTE_ADMIN',
    entityType: 'conversation',
    entityId: Number(conversationId),
    afterState: { promotedUserId: Number(targetUserId) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ message: 'Member promoted to admin' });
}

export async function demoteAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId, targetUserId } = request.params as any;
  const userId = (request as any).userId;
  await svc.demoteAdmin(Number(conversationId), userId, Number(targetUserId));
  recordAudit({
    actorId: userId ?? null,
    action: 'CHAT.GROUP_DEMOTE_ADMIN',
    entityType: 'conversation',
    entityId: Number(conversationId),
    afterState: { demotedUserId: Number(targetUserId) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ message: 'Admin demoted' });
}

// ── Pin Conversations ──
export async function pinConversationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  await svc.pinConversation(Number(conversationId), userId);
  return reply.send({ message: 'Conversation pinned' });
}

export async function unpinConversationHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  await svc.unpinConversation(Number(conversationId), userId);
  return reply.send({ message: 'Conversation unpinned' });
}

// ── Mark as Read ──
export async function markAsReadHandler(request: FastifyRequest, reply: FastifyReply) {
  const { conversationId } = request.params as any;
  const userId = (request as any).userId;
  await svc.markAsRead(Number(conversationId), userId);
  return reply.send({ message: 'Marked as read' });
}

// ── Ads ──
export async function getPlacementsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const placements = await svc.getPlacements();
  return reply.send({ data: placements });
}
export async function getActiveAdsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { placementId } = request.params as any;
  const ads = await svc.getActiveAds(Number(placementId));
  return reply.send({ data: ads });
}
export async function createCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCampaignSchema.parse(request.body);
  const userId = (request as any).userId;
  const id = await svc.createCampaign(userId, body);
  return reply.status(201).send({ id });
}

// ── Ads Admin ──
export async function getAllPlacementsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const placements = await svc.getAllPlacements();
  return reply.send({ data: placements });
}
export async function createPlacementHandler(request: FastifyRequest, reply: FastifyReply) {
  const placement = await svc.createPlacement(request.body);
  return reply.status(201).send(placement);
}
export async function updatePlacementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.updatePlacement(Number(id), request.body);
  return reply.send({ success: true });
}
export async function togglePlacementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await svc.togglePlacement(Number(id));
  return reply.send(result);
}
export async function deletePlacementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deletePlacement(Number(id));
  return reply.status(204).send();
}
export async function getAllCampaignsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const campaigns = await svc.getAllCampaigns();
  return reply.send({ data: campaigns });
}
export async function getCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const campaign = await svc.getCampaign(Number(id));
  return reply.send(campaign);
}
export async function updateCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const campaign = await svc.updateCampaign(Number(id), request.body);
  return reply.send(campaign);
}
export async function deleteCampaignHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deleteCampaign(Number(id));
  return reply.status(204).send();
}
export async function updateCampaignStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { status } = request.body as any;
  const campaign = await svc.updateCampaignStatus(Number(id), status);
  return reply.send(campaign);
}
export async function createCreativeHandler(request: FastifyRequest, reply: FastifyReply) {
  await svc.createCreative(request.body);
  return reply.status(201).send({ success: true });
}
export async function updateCreativeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.updateCreative(Number(id), request.body);
  return reply.send({ success: true });
}
export async function deleteCreativeHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deleteCreative(Number(id));
  return reply.status(204).send();
}

// ── Admin / Audit ──
export async function getAuditLogsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = AuditQuerySchema.parse(request.query);
  const logs = await svc.getAuditLogs(query);
  return reply.send(logs);
}
export async function revertActionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { auditLogId } = request.params as any;
  const body = RevertSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await svc.revertAction(Number(auditLogId), userId, body.reason);
  return reply.send(result);
}

// ── Admin: Events ──
export async function adminListEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page, limit, status } = request.query as any;
  const result = await svc.listEventsAdmin(Number(page) || 1, Number(limit) || 20, status);
  return reply.send(result);
}

export async function updateEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const e = await svc.updateEventAdmin(Number(id), request.body);
  return reply.send(e);
}

export async function deleteEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.deleteEvent(Number(id));
  return reply.status(204).send();
}
