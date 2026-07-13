import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import { requireFeatureFlag } from '../../../shared/middleware/feature-flag.middleware.js';
import * as ctrl from './community.controller.js';
export async function communityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Social features & Events — gated by community.events_enabled
  await app.register(async function socialScope(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireFeatureFlag('community.events_enabled'));

    scopedApp.post('/community/follow/:followingId', ctrl.followHandler);
    scopedApp.delete('/community/follow/:followingId', ctrl.unfollowHandler);
    scopedApp.get('/community/followers', ctrl.getFollowersHandler);
    scopedApp.get('/community/following', ctrl.getFollowingHandler);

    scopedApp.post('/community/friends/request/:addresseeId', ctrl.sendFriendRequestHandler);
    scopedApp.post('/community/friends/accept/:requesterId', ctrl.acceptFriendRequestHandler);
    scopedApp.get('/community/friends', ctrl.getFriendsHandler);

    scopedApp.get('/community/events', ctrl.listEventsHandler);
    scopedApp.get('/community/events/:id', ctrl.getEventHandler);
    scopedApp.post('/community/events', { preHandler: [requirePermission(['community.create_events'])] }, ctrl.createEventHandler);
    scopedApp.post('/community/events/:id/rsvp', ctrl.rsvpEventHandler);
    scopedApp.get('/admin/events', { preHandler: [adminGuard] }, ctrl.adminListEventsHandler);
    scopedApp.put('/community/events/:id', { preHandler: [adminGuard] }, ctrl.updateEventHandler);
    scopedApp.delete('/community/events/:id', { preHandler: [adminGuard] }, ctrl.deleteEventHandler);
  });

  // Chat — gated by community.chat_enabled
  await app.register(async function chatScope(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireFeatureFlag('community.chat_enabled'));

    scopedApp.get('/community/conversations', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getConversationsHandler);
    scopedApp.get('/community/conversations/invitations', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getGroupInvitationsHandler);
    scopedApp.put('/community/conversations/invitations/:invitationId', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.respondToInvitationHandler);
    scopedApp.post('/community/conversations/group', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.createGroupHandler);
    scopedApp.get('/community/users/lookup/phone/:phone', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.lookupUserByPhoneHandler);
    scopedApp.get('/community/conversations/with/phone/:phone', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getOrCreateConversationByPhoneHandler);
    scopedApp.get('/community/conversations/with/:otherUserId', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getOrCreateConversationHandler);
    scopedApp.get('/community/conversations/:conversationId/messages', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getMessagesHandler);
    scopedApp.post('/community/conversations/:conversationId/messages', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.sendMessageHandler);
    scopedApp.post('/community/conversations/:conversationId/invite', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.inviteToGroupHandler);
    scopedApp.put('/community/conversations/:conversationId/pin', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.pinConversationHandler);
    scopedApp.delete('/community/conversations/:conversationId/pin', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.unpinConversationHandler);
    scopedApp.put('/community/conversations/:conversationId/read', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.markAsReadHandler);
    scopedApp.get('/community/conversations/:conversationId/members', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getGroupMembersHandler);
    scopedApp.get('/community/conversations/:conversationId/info', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getGroupInfoHandler);
    scopedApp.get('/community/conversations/:conversationId/pending', { preHandler: [requirePermission(['community.chat.view'])] }, ctrl.getPendingInvitationsHandler);
    scopedApp.delete('/community/conversations/:conversationId/pending/:invitationId', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.cancelInvitationHandler);
    scopedApp.put('/community/conversations/:conversationId', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.updateGroupHandler);
    scopedApp.post('/community/conversations/:conversationId/members/remove', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.removeMemberHandler);
    scopedApp.post('/community/conversations/:conversationId/leave', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.leaveGroupHandler);
    scopedApp.put('/community/conversations/:conversationId/promote/:targetUserId', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.promoteAdminHandler);
    scopedApp.put('/community/conversations/:conversationId/demote/:targetUserId', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.demoteAdminHandler);
    scopedApp.delete('/community/conversations/:conversationId', { preHandler: [requirePermission(['community.chat.send'])] }, ctrl.deleteGroupHandler);
  });

  // Ads — gated by community.events_enabled (general community flag)
  await app.register(async function adsScope(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', requireFeatureFlag('community.events_enabled'));

    scopedApp.get('/ads/placements', ctrl.getPlacementsHandler);
    scopedApp.get('/ads/placements/:placementId/active', ctrl.getActiveAdsHandler);
    scopedApp.post('/ads/campaigns', { preHandler: [requirePermission(['ads.create'])] }, ctrl.createCampaignHandler);

    scopedApp.get('/ads/admin/placements', { preHandler: [adminGuard] }, ctrl.getAllPlacementsHandler);
    scopedApp.post('/ads/admin/placements', { preHandler: [adminGuard] }, ctrl.createPlacementHandler);
    scopedApp.put('/ads/admin/placements/:id', { preHandler: [adminGuard] }, ctrl.updatePlacementHandler);
    scopedApp.patch('/ads/admin/placements/:id/toggle', { preHandler: [adminGuard] }, ctrl.togglePlacementHandler);
    scopedApp.delete('/ads/admin/placements/:id', { preHandler: [adminGuard] }, ctrl.deletePlacementHandler);
    scopedApp.get('/ads/admin/campaigns', { preHandler: [adminGuard] }, ctrl.getAllCampaignsHandler);
    scopedApp.get('/ads/admin/campaigns/:id', { preHandler: [adminGuard] }, ctrl.getCampaignHandler);
    scopedApp.put('/ads/admin/campaigns/:id', { preHandler: [adminGuard] }, ctrl.updateCampaignHandler);
    scopedApp.patch('/ads/admin/campaigns/:id/status', { preHandler: [adminGuard] }, ctrl.updateCampaignStatusHandler);
    scopedApp.delete('/ads/admin/campaigns/:id', { preHandler: [adminGuard] }, ctrl.deleteCampaignHandler);
    scopedApp.post('/ads/admin/creatives', { preHandler: [adminGuard] }, ctrl.createCreativeHandler);
    scopedApp.put('/ads/admin/creatives/:id', { preHandler: [adminGuard] }, ctrl.updateCreativeHandler);
    scopedApp.delete('/ads/admin/creatives/:id', { preHandler: [adminGuard] }, ctrl.deleteCreativeHandler);
  });

  // Admin / Audit — revert action (list is handled by dedicated audit-log module)
  app.post('/admin/revert/:auditLogId', { preHandler: [requirePermission(['audit.revert'])] }, ctrl.revertActionHandler);
}
