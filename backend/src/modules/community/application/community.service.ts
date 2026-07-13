import { NotFoundError, ConflictError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { communityRepository as repo } from '../infrastructure/repositories/community.repository.js';

export const communityService = {
  // ── Follows ──
  async follow(followerId: number, followingId: number) {
    if (followerId === followingId) throw new ConflictError('Cannot follow yourself');
    await repo.follow(followerId, followingId);
  },
  async unfollow(followerId: number, followingId: number) { await repo.unfollow(followerId, followingId); },
  async getFollowers(userId: number) { return repo.findFollowers(userId); },
  async getFollowing(userId: number) { return repo.findFollowing(userId); },

  // ── Friends ──
  async sendFriendRequest(requesterId: number, addresseeId: number) {
    if (requesterId === addresseeId) throw new ConflictError('Cannot friend yourself');
    await repo.sendFriendRequest(requesterId, addresseeId);
  },
  async acceptFriendRequest(requesterId: number, addresseeId: number) {
    await repo.respondToFriendRequest(requesterId, addresseeId, 'accepted');
  },
  async rejectFriendRequest(requesterId: number, addresseeId: number) {
    await repo.respondToFriendRequest(requesterId, addresseeId, 'blocked');
  },
  async getFriends(userId: number) { return repo.findFriends(userId); },

  // ── Events ──
  async listEvents(page: number, limit: number) { return repo.findEvents({ page, limit }); },
  async getEvent(id: number) {
    const e = await repo.findEventById(id);
    if (!e) throw new NotFoundError('Event');
    const participants = await repo.findEventParticipants(id);
    return { ...e, participants };
  },
  async createEvent(userId: number, data: any) {
    const id = await repo.createEvent({ ...data, creatorId: userId });
    return repo.findEventById(id);
  },
  async rsvpEvent(eventId: number, userId: number, status: string) {
    const e = await repo.findEventById(eventId);
    if (!e) throw new NotFoundError('Event');
    await repo.rsvpEvent(eventId, userId, status);
  },

  // ── Admin: Events ──
  async listEventsAdmin(page: number, limit: number, status?: string) {
    return repo.findEventsAdmin({ page, limit, status });
  },
  async updateEventAdmin(id: number, data: any) {
    const updated = await repo.updateEvent(id, data);
    if (!updated) throw new NotFoundError('Event');
    return repo.findEventById(id);
  },
  async deleteEvent(id: number) {
    const e = await repo.findEventById(id);
    if (!e) throw new NotFoundError('Event');
    await repo.softDeleteEvent(id);
    return { success: true };
  },

  // ── Chat ──
  async getOrCreateConversation(userId: number, otherUserId: number) {
    if (userId === otherUserId) throw new ConflictError('Cannot message yourself');
    return repo.findOrCreateDirectConversation(userId, otherUserId);
  },
  async getOrCreateConversationByPhone(userId: number, phone: string) {
    const otherUserId = await repo.findUserIdByPhone(phone);
    if (!otherUserId) throw new NotFoundError('User with this phone number');
    if (userId === otherUserId) throw new ConflictError('Cannot message yourself');
    return repo.findOrCreateDirectConversation(userId, otherUserId);
  },
  async lookupUserByPhone(phone: string) {
    const user = await repo.findUserByPhoneInfo(phone);
    if (!user) throw new NotFoundError('User with this phone number');
    return user;
  },
  async getConversations(userId: number) { return repo.findConversations(userId); },
  async sendMessage(conversationId: number, senderId: number, content: string) {
    if (!(await repo.isConversationParticipant(conversationId, senderId))) {
      throw new ForbiddenError('Not a participant in this conversation');
    }
    await repo.sendMessage(conversationId, senderId, content);
  },
  async getMessages(conversationId: number, userId: number, page: number, limit: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this conversation');
    }
    return repo.findMessages(conversationId, page, limit);
  },

  // ── Group Chat ──
  async createGroup(userId: number, name: string, avatarUrl: string | undefined, inviteeIds: number[]) {
    return repo.createGroupConversation(userId, name, avatarUrl, inviteeIds);
  },

  async inviteToGroup(conversationId: number, userId: number, inviteeId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this conversation');
    }
    if (!(await repo.isGroupCreator(conversationId, userId)) && !(await repo.isGroupAdmin(conversationId, userId))) {
      throw new ForbiddenError('Only the group creator or admin can invite members');
    }
    if (await repo.isAlreadyInvited(conversationId, inviteeId)) {
      throw new ConflictError('User already invited');
    }
    await repo.inviteToGroup(conversationId, userId, inviteeId);
  },

  async removeMember(conversationId: number, userId: number, targetUserId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this group');
    }
    if (userId === targetUserId) {
      throw new ConflictError('Use leave group to remove yourself');
    }
    const isCreator = await repo.isGroupCreator(conversationId, userId);
    const isAdmin = await repo.isGroupAdmin(conversationId, userId);
    if (!isCreator && !isAdmin) {
      throw new ForbiddenError('Only the group creator or admin can remove members');
    }
    const targetIsCreator = await repo.isGroupCreator(conversationId, targetUserId);
    if (targetIsCreator) {
      throw new ForbiddenError('Cannot remove the group creator');
    }
    const targetIsAdmin = await repo.isGroupAdmin(conversationId, targetUserId);
    if (targetIsAdmin && !isCreator) {
      throw new ForbiddenError('Only the group creator can remove admins');
    }
    await repo.removeMember(conversationId, targetUserId);
  },

  async leaveGroup(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this group');
    }
    const info = await repo.getGroupInfo(conversationId);
    if (info && info.created_by === userId) {
      throw new ConflictError('Group creator cannot leave. Delete the group instead.');
    }
    await repo.leaveGroup(conversationId, userId);
  },

  async deleteGroup(conversationId: number, userId: number) {
    if (!(await repo.isGroupCreator(conversationId, userId))) {
      throw new ForbiddenError('Only the group creator can delete the group');
    }
    await repo.deleteGroup(conversationId);
  },

  async getPendingInvitations(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this group');
    }
    return repo.findPendingInvitationsByConversation(conversationId);
  },

  async cancelInvitation(conversationId: number, userId: number, invitationId: number) {
    const isCreator = await repo.isGroupCreator(conversationId, userId);
    const isAdmin = await repo.isGroupAdmin(conversationId, userId);
    if (!isCreator && !isAdmin) {
      throw new ForbiddenError('Only the group creator or admin can cancel invitations');
    }
    await repo.cancelInvitation(invitationId);
  },

  async getGroupInvitations(userId: number) {
    return repo.findGroupInvitations(userId);
  },

  async respondToInvitation(invitationId: number, userId: number, status: string) {
    const invitation = await repo.findInvitationById(invitationId);
    if (!invitation) throw new NotFoundError('Invitation');
    if (invitation.invitee_id !== userId) throw new ForbiddenError('Invitation does not belong to you');
    if (invitation.status !== 'pending') throw new ConflictError('Invitation already responded to');
    await repo.respondToInvitation(invitationId, userId, status);
  },

  // ── Group Management ──
  async getGroupMembers(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this group');
    }
    return repo.getGroupMembers(conversationId);
  },

  async getGroupInfo(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this group');
    }
    const info = await repo.getGroupInfo(conversationId);
    if (!info) throw new NotFoundError('Group conversation');
    return info;
  },

  async updateGroup(conversationId: number, userId: number, data: { name?: string; avatarUrl?: string }) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this group');
    }
    if (!(await repo.isGroupCreator(conversationId, userId)) && !(await repo.isGroupAdmin(conversationId, userId))) {
      throw new ForbiddenError('Only the group creator or admin can edit group settings');
    }
    await repo.updateGroup(conversationId, data);
    return repo.getGroupInfo(conversationId);
  },

  async promoteAdmin(conversationId: number, userId: number, targetUserId: number) {
    if (!(await repo.isGroupCreator(conversationId, userId))) {
      throw new ForbiddenError('Only the group creator can promote admins');
    }
    if (!(await repo.isConversationParticipant(conversationId, targetUserId))) {
      throw new ForbiddenError('User is not a member of this group');
    }
    await repo.promoteAdmin(conversationId, targetUserId);
  },

  async demoteAdmin(conversationId: number, userId: number, targetUserId: number) {
    if (!(await repo.isGroupCreator(conversationId, userId))) {
      throw new ForbiddenError('Only the group creator can demote admins');
    }
    await repo.demoteAdmin(conversationId, targetUserId);
  },

  // ── Pin Conversations ──
  async pinConversation(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this conversation');
    }
    const count = await repo.getPinCount(userId);
    if (count >= 5) throw new ConflictError('Maximum 5 pinned conversations');
    await repo.pinConversation(conversationId, userId);
  },

  async unpinConversation(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this conversation');
    }
    await repo.unpinConversation(conversationId, userId);
  },

  async markAsRead(conversationId: number, userId: number) {
    if (!(await repo.isConversationParticipant(conversationId, userId))) {
      throw new ForbiddenError('Not a participant in this conversation');
    }
    await repo.markAsRead(conversationId, userId);
  },

  // ── Ads ──
  async getPlacements() { return repo.findPlacements(); },
  async getActiveAds(placementId: number) { return repo.findActiveCampaigns(placementId); },
  async createCampaign(userId: number, data: any) {
    const campaignId = await repo.createCampaign({ ...data, createdBy: userId });
    if (data.imageUrl) {
      await repo.addCreative({ campaignId, imageUrl: data.imageUrl, clickUrl: data.clickUrl, altText: data.altText });
    }
    return campaignId;
  },

  // ── Ads Admin ──
  async getAllPlacements() { return repo.findAllPlacements(); },
  async createPlacement(data: any) { const id = await repo.createPlacement(data); return { id, ...data }; },
  async updatePlacement(id: number, data: any) { await repo.updatePlacement(id, data); },
  async togglePlacement(id: number) { return repo.togglePlacement(id); },
  async deletePlacement(id: number) { await repo.deletePlacement(id); },
  async getAllCampaigns() { return repo.findAllCampaigns(); },
  async getCampaign(id: number) { return repo.findCampaign(id); },
  async updateCampaign(id: number, data: any) { await repo.updateCampaign(id, data); return repo.findCampaign(id); },
  async deleteCampaign(id: number) { await repo.deleteCampaign(id); },
  async updateCampaignStatus(id: number, status: string) { await repo.updateCampaignStatus(id, status); return repo.findCampaign(id); },
  async createCreative(data: any) { await repo.addCreative(data); },
  async updateCreative(id: number, data: any) { await repo.updateCreative(id, data); },
  async deleteCreative(id: number) { await repo.deleteCreative(id); },

  // ── Admin / Audit ──
  async getAuditLogs(filters: any) { return repo.findAuditLogs(filters); },
  async revertAction(auditLogId: number, revertedBy: number, reason: string) {
    return repo.revertAction(auditLogId, revertedBy, reason);
  },
};
