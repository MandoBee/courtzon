import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-02 — B25: messaging REST authorization (previously 0 tests).
 *
 * `communityService` is the REST authorization layer for conversations. These
 * tests lock the participant-only read/write rules, the group creator/admin
 * matrix, invitation ownership and the "creator cannot be removed" invariant.
 * The repository is fully mocked; no database or Redis is used.
 */

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockEmit = vi.hoisted(() => vi.fn());

vi.mock('../infrastructure/repositories/community.repository.js', () => ({ communityRepository: repoMock }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit } }));

import { communityService } from '../application/community.service.js';

const CONVO = 55;
const MEMBER = 1;
const OTHER_MEMBER = 2;
const OUTSIDER = 3;
const CREATOR = 10;
const GROUP_ADMIN = 11;
const INVITEE = 20;

function resetRepo() {
  for (const key of Object.keys(repoMock)) delete repoMock[key];
  Object.assign(repoMock, {
    isConversationParticipant: vi.fn(async () => false),
    isGroupCreator: vi.fn(async () => false),
    isGroupAdmin: vi.fn(async () => false),
    isAlreadyInvited: vi.fn(async () => false),
    findMessages: vi.fn(async () => [{ id: 1, content: 'hi' }]),
    sendMessage: vi.fn(async () => 1),
    getParticipantUserIds: vi.fn(async () => [MEMBER, OTHER_MEMBER]),
    getUserName: vi.fn(async () => 'User'),
    inviteToGroup: vi.fn(async () => undefined),
    removeMember: vi.fn(async () => undefined),
    leaveGroup: vi.fn(async () => undefined),
    deleteGroup: vi.fn(async () => undefined),
    getGroupInfo: vi.fn(async () => ({ id: CONVO, name: 'Group', created_by: CREATOR })),
    getGroupMembers: vi.fn(async () => [{ user_id: MEMBER }]),
    updateGroup: vi.fn(async () => undefined),
    promoteAdmin: vi.fn(async () => undefined),
    demoteAdmin: vi.fn(async () => undefined),
    findPendingInvitationsByConversation: vi.fn(async () => []),
    findInvitationById: vi.fn(async () => null),
    respondToInvitation: vi.fn(async () => undefined),
    getPinCount: vi.fn(async () => 0),
    pinConversation: vi.fn(async () => undefined),
    markAsRead: vi.fn(async () => undefined),
  });
}

const asParticipant = () => repoMock.isConversationParticipant.mockResolvedValue(true);

describe('community messaging — participant-only access', () => {
  beforeEach(resetRepo);

  it('rejects reading messages for a non-participant and performs no read', async () => {
    await expect(communityService.getMessages(CONVO, OUTSIDER, 1, 50)).rejects.toThrow(/participant/i);
    expect(repoMock.findMessages).not.toHaveBeenCalled();
  });

  it('returns messages for a participant', async () => {
    asParticipant();
    await expect(communityService.getMessages(CONVO, MEMBER, 1, 50)).resolves.toEqual([{ id: 1, content: 'hi' }]);
  });

  it('rejects sending a message as a non-participant and never writes or emits', async () => {
    await expect(communityService.sendMessage(CONVO, OUTSIDER, 'hello')).rejects.toThrow(/participant/i);
    expect(repoMock.sendMessage).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('sends a message and emits chat:new-message for a participant', async () => {
    asParticipant();
    await communityService.sendMessage(CONVO, MEMBER, 'hello');
    expect(repoMock.sendMessage).toHaveBeenCalledWith(CONVO, MEMBER, 'hello');
    expect(mockEmit).toHaveBeenCalledWith(
      'chat:new-message',
      expect.objectContaining({ conversationId: CONVO, userId: MEMBER, participantUserIds: [MEMBER, OTHER_MEMBER] }),
    );
  });

  it('rejects group info and member listing for a non-participant', async () => {
    await expect(communityService.getGroupInfo(CONVO, OUTSIDER)).rejects.toThrow(/participant/i);
    await expect(communityService.getGroupMembers(CONVO, OUTSIDER)).rejects.toThrow(/participant/i);
    expect(repoMock.getGroupMembers).not.toHaveBeenCalled();
  });

  it('rejects pin and read-receipt writes for a non-participant', async () => {
    await expect(communityService.pinConversation(CONVO, OUTSIDER)).rejects.toThrow(/participant/i);
    await expect(communityService.markAsRead(CONVO, OUTSIDER)).rejects.toThrow(/participant/i);
    expect(repoMock.markAsRead).not.toHaveBeenCalled();
  });
});

describe('community messaging — group creator/admin matrix', () => {
  beforeEach(resetRepo);

  it('rejects invitations from an ordinary member', async () => {
    asParticipant();
    await expect(communityService.inviteToGroup(CONVO, MEMBER, INVITEE)).rejects.toThrow(/creator or admin/i);
    expect(repoMock.inviteToGroup).not.toHaveBeenCalled();
  });

  it('allows a group admin to invite', async () => {
    asParticipant();
    repoMock.isGroupAdmin.mockResolvedValue(true);
    await communityService.inviteToGroup(CONVO, GROUP_ADMIN, INVITEE);
    expect(repoMock.inviteToGroup).toHaveBeenCalledWith(CONVO, GROUP_ADMIN, INVITEE);
  });

  it('rejects member removal by a non-admin and removal of the creator', async () => {
    asParticipant();
    await expect(communityService.removeMember(CONVO, MEMBER, OTHER_MEMBER)).rejects.toThrow(/creator or admin/i);
    repoMock.isGroupCreator.mockImplementation(async (_c: number, u: number) => u === CREATOR);
    await expect(communityService.removeMember(CONVO, CREATOR, CREATOR)).rejects.toThrow(/leave group/i);
    repoMock.isConversationParticipant.mockResolvedValue(true);
    await expect(communityService.removeMember(CONVO, GROUP_ADMIN, CREATOR)).rejects.toThrow(/creator/i);
    expect(repoMock.removeMember).not.toHaveBeenCalled();
  });

  it('lets a group admin remove a regular member but not another admin', async () => {
    asParticipant();
    repoMock.isGroupAdmin.mockImplementation(async (_c: number, u: number) => u === GROUP_ADMIN);
    await communityService.removeMember(CONVO, GROUP_ADMIN, OTHER_MEMBER);
    expect(repoMock.removeMember).toHaveBeenCalledWith(CONVO, OTHER_MEMBER);

    repoMock.isGroupAdmin.mockImplementation(async (_c: number, u: number) => u === GROUP_ADMIN || u === OTHER_MEMBER);
    await expect(communityService.removeMember(CONVO, GROUP_ADMIN, OTHER_MEMBER)).rejects.toThrow(/only the group creator/i);
  });

  it('rejects group deletion by a non-creator and allows the creator', async () => {
    await expect(communityService.deleteGroup(CONVO, GROUP_ADMIN)).rejects.toThrow(/creator/i);
    repoMock.isGroupCreator.mockResolvedValue(true);
    await communityService.deleteGroup(CONVO, CREATOR);
    expect(repoMock.deleteGroup).toHaveBeenCalledWith(CONVO);
  });

  it('rejects group settings changes by an ordinary member and allows an admin', async () => {
    asParticipant();
    await expect(communityService.updateGroup(CONVO, MEMBER, { name: 'x' })).rejects.toThrow(/creator or admin/i);
    repoMock.isGroupAdmin.mockResolvedValue(true);
    await communityService.updateGroup(CONVO, GROUP_ADMIN, { name: 'Renamed' });
    expect(repoMock.updateGroup).toHaveBeenCalledWith(CONVO, { name: 'Renamed' });
  });
});

describe('community messaging — invitation ownership', () => {
  beforeEach(resetRepo);

  it('rejects an invitation that belongs to another user', async () => {
    repoMock.findInvitationById.mockResolvedValue({ id: 7, invitee_id: INVITEE, status: 'pending' });
    await expect(communityService.respondToInvitation(7, OUTSIDER, 'accepted')).rejects.toThrow(/belong to you/i);
    expect(repoMock.respondToInvitation).not.toHaveBeenCalled();
  });

  it('accepts the invitee\'s own pending invitation once', async () => {
    repoMock.findInvitationById.mockResolvedValue({ id: 7, invitee_id: INVITEE, status: 'pending' });
    await communityService.respondToInvitation(7, INVITEE, 'accepted');
    expect(repoMock.respondToInvitation).toHaveBeenCalledWith(7, INVITEE, 'accepted');
  });

  it('rejects a repeated response to an already-answered invitation', async () => {
    repoMock.findInvitationById.mockResolvedValue({ id: 7, invitee_id: INVITEE, status: 'accepted' });
    await expect(communityService.respondToInvitation(7, INVITEE, 'accepted')).rejects.toThrow(/already responded/i);
  });
});
