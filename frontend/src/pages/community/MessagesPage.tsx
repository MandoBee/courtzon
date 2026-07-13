import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth.store';
import { useCan } from '../../hooks/useCan';
import { Can } from '../../permissions/Can';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { EntityImage } from '../../components/ui';

function formatTime(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const MAX_PINS = 5;

export default function MessagesPage() {
  const { can } = useCan();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const withParam = searchParams.get('with');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newStep, setNewStep] = useState<'phone' | 'confirm'>('phone');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Group creation state ---
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | undefined>(undefined);
  const [groupMembers, setGroupMembers] = useState<{ id: number; full_name: string; avatar_url?: string; phone: string }[]>([]);
  const [groupPhone, setGroupPhone] = useState('');
  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);

  // --- Group settings state ---
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAvatarFile, setEditGroupAvatarFile] = useState<File | null>(null);
  const [editGroupAvatarUrl, setEditGroupAvatarUrl] = useState<string | undefined>(undefined);
  const [addMemberPhone, setAddMemberPhone] = useState('');

  const { data: conversations, isLoading: loadingConvos } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/community/conversations').then((r) => r.data?.data || []),
    enabled: can('community.chat.view'),
    refetchInterval: 15000,
  });

  const { data: invitations } = useQuery({
    queryKey: ['chat-invitations'],
    queryFn: () => api.get('/community/conversations/invitations').then((r) => r.data?.data || []),
    enabled: can('community.chat.view'),
    refetchInterval: 30000,
  });

  const pendingInvitations = invitations?.filter((inv: any) => inv.status === 'pending') || [];

  const selectedConvo = conversations?.find((c: any) => c.id === selectedId);

  const { data: groupInfo, refetch: refetchGroupInfo } = useQuery({
    queryKey: ['chat-group-info', selectedId],
    queryFn: () => api.get(`/community/conversations/${selectedId}/info`).then((r) => r.data),
    enabled: !!selectedId && selectedConvo?.conversation_type === 'group' && can('community.chat.view'),
  });

  const { data: groupMembersData, refetch: refetchGroupMembers } = useQuery({
    queryKey: ['chat-group-members', selectedId],
    queryFn: () => api.get(`/community/conversations/${selectedId}/members`).then((r) => r.data?.data || []),
    enabled: !!selectedId && selectedConvo?.conversation_type === 'group' && groupSettingsOpen && can('community.chat.view'),
  });

  const { data: pendingInvitationsData, refetch: refetchPending } = useQuery({
    queryKey: ['chat-group-pending', selectedId],
    queryFn: () => api.get(`/community/conversations/${selectedId}/pending`).then((r) => r.data?.data || []),
    enabled: !!selectedId && selectedConvo?.conversation_type === 'group' && groupSettingsOpen && can('community.chat.view'),
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => api.delete(`/community/conversations/${selectedId}/pending/${invitationId}`),
    onSuccess: () => {
      refetchPending();
      showToast('Invitation cancelled');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not cancel invitation', 'error'),
  });

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api.get(`/community/conversations/${selectedId}/messages`, { params: { limit: 100 } }).then((r) => r.data?.data || []),
    enabled: !!selectedId && can('community.chat.view'),
    refetchInterval: selectedId ? 4000 : false,
  });

  // --- Direct message mutations ---
  const startConvoMutation = useMutation({
    mutationFn: (phone: string) => api.get(`/community/conversations/with/phone/${encodeURIComponent(phone)}`).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setSelectedId(data.conversationId);
      setNewOpen(false);
      setNewPhone('');
      setNewStep('phone');
      searchParams.delete('with');
      setSearchParams(searchParams, { replace: true });
      showToast('Conversation opened');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not start conversation', 'error'),
  });

  const { data: lookupResult } = useQuery({
    queryKey: ['chat-user-lookup', newPhone],
    queryFn: () => api.get(`/community/users/lookup/phone/${encodeURIComponent(newPhone)}`).then((r) => r.data.data),
    enabled: false,
    retry: false,
  });

  const startConvoByIdMutation = useMutation({
    mutationFn: (otherUserId: number) => api.get(`/community/conversations/with/${otherUserId}`).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setSelectedId(data.conversationId);
      setNewOpen(false);
      searchParams.delete('with');
      setSearchParams(searchParams, { replace: true });
      showToast('Conversation opened');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not start conversation', 'error'),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/community/conversations/${selectedId}/messages`, { content: draft.trim() }),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      showToast('Message sent');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to send', 'error'),
  });

  // --- Pin/unpin mutations ---
  const pinMutation = useMutation({
    mutationFn: (conversationId: number) => api.put(`/community/conversations/${conversationId}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      showToast('Conversation pinned');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not pin', 'error'),
  });

  const unpinMutation = useMutation({
    mutationFn: (conversationId: number) => api.delete(`/community/conversations/${conversationId}/pin`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      showToast('Conversation unpinned');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not unpin', 'error'),
  });

  // --- Mark as read mutation ---
  const markReadMutation = useMutation({
    mutationFn: (conversationId: number) => api.put(`/community/conversations/${conversationId}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
  });

  // --- Invitation mutations ---
  const respondInvitationMutation = useMutation({
    mutationFn: ({ invitationId, status }: { invitationId: number; status: 'accepted' | 'rejected' }) =>
      api.put(`/community/conversations/invitations/${invitationId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-invitations'] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      showToast('Invitation updated');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not respond to invitation', 'error'),
  });

  // --- Group creation mutations ---
  const createGroupMutation = useMutation({
    mutationFn: (body: { name: string; avatarUrl?: string; inviteeIds: number[] }) =>
      api.post('/community/conversations/group', body).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setSelectedId(data.conversationId);
      closeGroupModal();
      showToast('Group created');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not create group', 'error'),
  });

  const groupLookupMutation = useMutation({
    mutationFn: (phone: string) => api.get(`/community/users/lookup/phone/${encodeURIComponent(phone)}`).then((r) => r.data.data),
    onError: () => showToast('No user found with this phone number', 'error'),
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('avatar', file);
      return api.post('/upload/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.url || r.data.data?.url);
    },
  });

  // --- Group settings mutations ---
  const updateGroupMutation = useMutation({
    mutationFn: ({ name, avatarUrl }: { name?: string; avatarUrl?: string }) =>
      api.put(`/community/conversations/${selectedId}`, { name, avatarUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      refetchGroupInfo();
      showToast('Group updated');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not update group', 'error'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (targetUserId: number) =>
      api.post(`/community/conversations/${selectedId}/members/remove`, { targetUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      refetchGroupMembers();
      showToast('Member removed');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not remove member', 'error'),
  });

  const leaveGroupMutation = useMutation({
    mutationFn: () => api.post(`/community/conversations/${selectedId}/leave`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setSelectedId(null);
      setGroupSettingsOpen(false);
      showToast('Left group');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not leave group', 'error'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => api.delete(`/community/conversations/${selectedId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      setSelectedId(null);
      setGroupSettingsOpen(false);
      showToast('Group deleted');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not delete group', 'error'),
  });

  const inviteMemberMutation = useMutation({
    mutationFn: ({ inviteeId }: { inviteeId: number }) =>
      api.post(`/community/conversations/${selectedId}/invite`, { inviteeId }),
    onSuccess: () => {
      refetchGroupMembers();
      showToast('Member invited');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not invite member', 'error'),
  });

  useEffect(() => {
    if (!withParam || !can('community.chat.view')) return;
    const uid = Number(withParam);
    if (!uid || uid === user?.id) return;
    startConvoByIdMutation.mutate(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withParam, can, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (selectedId) {
      markReadMutation.mutate(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!can('community.chat.view')) {
    return <p className="text-[var(--color-text-muted)]">You do not have permission to view messages.</p>;
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const phone = newPhone.trim();
    if (!phone) {
      showToast('Enter a phone number', 'warning');
      return;
    }
    qc.fetchQuery({
      queryKey: ['chat-user-lookup', phone],
      queryFn: () => api.get(`/community/users/lookup/phone/${encodeURIComponent(phone)}`).then((r) => r.data.data),
      retry: false,
    }).then(() => {
      setNewStep('confirm');
    }).catch(() => {
      showToast('No user found with this phone number', 'error');
    });
  }

  function handleConfirmStart() {
    startConvoMutation.mutate(newPhone.trim());
  }

  function handleCloseModal() {
    setNewOpen(false);
    setNewPhone('');
    setNewStep('phone');
  }

  function handlePinToggle(c: any) {
    const pinCount = conversations?.filter((x: any) => x.pinned_at).length || 0;
    if (c.pinned_at) {
      unpinMutation.mutate(c.id);
    } else {
      if (pinCount >= MAX_PINS) {
        showToast(`Maximum ${MAX_PINS} pinned conversations`, 'error');
        return;
      }
      pinMutation.mutate(c.id);
    }
  }

  async function handleGroupLookup() {
    const phone = groupPhone.trim();
    if (!phone) {
      showToast('Enter a phone number', 'warning');
      return;
    }
    if (groupMembers.some((m) => m.phone === phone)) {
      showToast('Already added', 'warning');
      return;
    }
    const result = await groupLookupMutation.mutateAsync(phone);
    if (result) {
      setGroupMembers((prev) => [...prev, { id: result.id, full_name: result.full_name, avatar_url: result.avatar_url, phone }]);
      setGroupPhone('');
    }
  }

  function handleRemoveMember(phone: string) {
    setGroupMembers((prev) => prev.filter((m) => m.phone !== phone));
  }

  async function handleCreateGroup() {
    if (!groupName.trim()) {
      showToast('Enter a group name', 'warning');
      return;
    }
    if (groupMembers.length === 0) {
      showToast('Add at least one member', 'warning');
      return;
    }
    let avatarUrl = groupAvatarUrl;
    if (groupAvatarFile) {
      const url = await uploadAvatarMutation.mutateAsync(groupAvatarFile);
      if (url) avatarUrl = url;
    }
    createGroupMutation.mutate({
      name: groupName.trim(),
      avatarUrl,
      inviteeIds: groupMembers.map((m) => m.id),
    });
  }

  function closeGroupModal() {
    setGroupOpen(false);
    setGroupName('');
    setGroupAvatarUrl(undefined);
    setGroupAvatarFile(null);
    setGroupMembers([]);
    setGroupPhone('');
  }

  // --- Group settings handlers ---
  function openGroupSettings() {
    setGroupSettingsOpen(true);
    setEditGroupName(groupInfo?.name || selectedConvo?.group_name || '');
    setEditGroupAvatarUrl(groupInfo?.avatar_url || selectedConvo?.group_avatar_url);
    setEditGroupAvatarFile(null);
    setAddMemberPhone('');
  }

  function closeGroupSettings() {
    setGroupSettingsOpen(false);
    setEditGroupName('');
    setEditGroupAvatarFile(null);
    setEditGroupAvatarUrl(undefined);
    setAddMemberPhone('');
  }

  async function handleSaveGroupInfo() {
    let avatarUrl = editGroupAvatarUrl;
    if (editGroupAvatarFile) {
      const url = await uploadAvatarMutation.mutateAsync(editGroupAvatarFile);
      if (url) avatarUrl = url;
    }
    updateGroupMutation.mutate({ name: editGroupName.trim() || undefined, avatarUrl });
  }

  async function handleAddMemberToGroup() {
    const phone = addMemberPhone.trim();
    if (!phone) {
      showToast('Enter a phone number', 'warning');
      return;
    }
    const result = await groupLookupMutation.mutateAsync(phone);
    if (result) {
      inviteMemberMutation.mutate({ inviteeId: result.id });
      setAddMemberPhone('');
    }
  }

  const isGroupCreator = groupInfo?.created_by === user?.id || selectedConvo?.created_by === user?.id;
  const isGroupAdmin = groupMembersData?.some((m: any) => m.id === user?.id && m.is_admin) || false;
  const canManageGroup = isGroupCreator || isGroupAdmin;

  const promoteAdminMutation = useMutation({
    mutationFn: (targetUserId: number) => api.put(`/community/conversations/${selectedId}/promote/${targetUserId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-group-members', selectedId] });
      showToast('Member promoted to admin');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not promote', 'error'),
  });

  const demoteAdminMutation = useMutation({
    mutationFn: (targetUserId: number) => api.put(`/community/conversations/${selectedId}/demote/${targetUserId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-group-members', selectedId] });
      showToast('Admin demoted');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Could not demote', 'error'),
  });

  const pinnedConvos = conversations?.filter((c: any) => c.pinned_at) || [];
  const unpinnedConvos = conversations?.filter((c: any) => !c.pinned_at) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">💬 Messages</h1>
        <div className="flex gap-2">
          <Can permission="community.chat.view">
            <button
              onClick={() => setGroupOpen(true)}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              + Create Group
            </button>
            <button
              onClick={() => setNewOpen(true)}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90"
            >
              + New message
            </button>
          </Can>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 min-h-[60vh] border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface)]">
        {/* Conversation list */}
        <aside className={`w-full md:w-80 md:max-w-xs border-b md:border-b-0 md:border-r border-[var(--color-border)] flex flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-[var(--color-border)] font-medium text-sm text-[var(--color-text-muted)]">
            Conversations
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Invitations section */}
            {pendingInvitations.length > 0 && (
              <div className="border-b border-[var(--color-border)]">
                <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Pending Invitations ({pendingInvitations.length})
                </div>
                {pendingInvitations.map((inv: any) => (
                  <div key={inv.id} className="px-3 py-3 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-2 mb-2">
                      <EntityImage
                        src={inv.inviter_avatar_url}
                        name={inv.inviter_name || 'User'}
                        className="w-8 h-8 rounded-full text-xs shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          <span className="font-medium text-[var(--color-text)]">{inv.inviter_name}</span> invited you to
                        </p>
                        <p className="text-sm font-medium text-[var(--color-text)] truncate">{inv.conversation_name || 'a group'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => respondInvitationMutation.mutate({ invitationId: inv.id, status: 'accepted' })}
                        disabled={respondInvitationMutation.isPending}
                        className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:opacity-90 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respondInvitationMutation.mutate({ invitationId: inv.id, status: 'rejected' })}
                        disabled={respondInvitationMutation.isPending}
                        className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:opacity-90 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loadingConvos ? (
              <div className="p-4 animate-pulse h-16 bg-[var(--color-border)] bg-[var(--color-surface)] m-2 rounded-lg" />
            ) : !conversations?.length ? (
              <p className="p-4 text-sm text-[var(--color-text-muted)]">No conversations yet. Start one with + New message.</p>
            ) : (
              <>
                {pinnedConvos.length > 0 && (
                  <div>
                    {pinnedConvos.map((c: any) => (
                      <ConversationItem
                        key={c.id}
                        c={c}
                        selectedId={selectedId}
                        onSelect={() => setSelectedId(c.id)}
                        onPinToggle={() => handlePinToggle(c)}
                      />
                    ))}
                  </div>
                )}
                {unpinnedConvos.length > 0 && (
                  <div>
                    {unpinnedConvos.map((c: any) => (
                      <ConversationItem
                        key={c.id}
                        c={c}
                        selectedId={selectedId}
                        onSelect={() => setSelectedId(c.id)}
                        onPinToggle={() => handlePinToggle(c)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className={`flex-1 flex flex-col min-h-[50vh] ${!selectedId ? 'hidden md:flex' : 'flex'}`}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)] text-sm p-6">
              Select a conversation or start a new message
            </div>
          ) : (
            <>
              <div className="p-3 border-b border-[var(--color-border)] flex items-center gap-2">
                <button type="button" className="md:hidden text-sm text-[var(--color-primary)]" onClick={() => setSelectedId(null)}>
                  ← Back
                </button>
                {selectedConvo?.conversation_type === 'group' ? (
                  <>
                    <EntityImage
                      src={selectedConvo?.group_avatar_url}
                      name={selectedConvo?.group_name || 'Group'}
                      className="w-8 h-8 rounded-full text-xs shrink-0"
                    />
                    <span className="font-medium text-[var(--color-text)]">{selectedConvo?.group_name || 'Group'}</span>
                    <button
                      type="button"
                      onClick={openGroupSettings}
                      className="ml-auto p-1.5 rounded-lg hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                      title="Group settings"
                    >
                      ⚙️
                    </button>
                  </>
                ) : (
                  <span className="font-medium text-[var(--color-text)]">
                    {selectedConvo?.other_user_name || 'Conversation'}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="animate-pulse h-20 bg-[var(--color-border)] bg-[var(--color-surface)] rounded-lg" />
                ) : (
                  messages?.map((m: any) => {
                    const mine = m.sender_id === user?.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] md:max-w-[70%] px-3 py-2 rounded-2xl text-sm ${
                            mine
                              ? 'bg-[var(--color-primary)] text-white rounded-br-md'
                              : 'bg-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-bl-md'
                          }`}
                        >
                          {!mine && <p className="text-[10px] opacity-70 mb-0.5">{m.sender_name}</p>}
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-[var(--color-text-muted)]'}`}>
                            {formatTime(m.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              <Can permission="community.chat.send">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!draft.trim() || sendMutation.isPending) return;
                    sendMutation.mutate();
                  }}
                  className="p-3 border-t border-[var(--color-border)] flex gap-2"
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    maxLength={5000}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sendMutation.isPending}
                    className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </Can>
            </>
          )}
        </section>
      </div>

      {/* New message modal */}
      <Modal open={newOpen} onClose={handleCloseModal} title="New message">
        {newStep === 'phone' ? (
          <form onSubmit={handleLookup} className="space-y-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              Enter the other user&apos;s phone number to look them up.
            </p>
            <label className="block">
              <span className="text-xs font-medium text-[var(--color-text-muted)]">Phone Number *</span>
              <input
                required
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="e.g. 0501234567"
                className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90">
                Look up
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-[var(--color-text-muted)]">
              Is this the right person?
            </p>
            <div className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg)]">
              <EntityImage
                src={lookupResult?.avatar_url}
                name={lookupResult?.full_name || 'User'}
                className="w-12 h-12 rounded-full text-base shrink-0"
              />
              <div>
                <p className="font-medium text-sm text-[var(--color-text)]">{lookupResult?.full_name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{newPhone}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setNewStep('phone')} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Back</button>
              <button onClick={handleConfirmStart} disabled={startConvoMutation.isPending} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90">
                {startConvoMutation.isPending ? 'Opening…' : 'Start chat'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create Group modal */}
      <Modal open={groupOpen} onClose={closeGroupModal} title="Create Group">
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Group Name *</span>
            <input
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Court Session"
              className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Group Avatar (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setGroupAvatarFile(file);
                  setGroupAvatarUrl(URL.createObjectURL(file));
                }
              }}
              className="mt-1 w-full text-sm text-[var(--color-text)]"
            />
            {groupAvatarUrl && (
              <div className="mt-2">
                <EntityImage src={groupAvatarUrl} name={groupName || 'Group'} className="w-16 h-16 rounded-full text-lg" />
              </div>
            )}
          </label>

          <div>
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Add Members</span>
            <div className="flex gap-2 mt-1">
              <input
                type="tel"
                value={groupPhone}
                onChange={(e) => setGroupPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleGroupLookup();
                  }
                }}
                placeholder="Phone number"
                className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
              />
              <button
                type="button"
                onClick={handleGroupLookup}
                disabled={groupLookupMutation.isPending}
                className="px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
              >
                {groupLookupMutation.isPending ? '…' : 'Add'}
              </button>
            </div>
            {groupMembers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {groupMembers.map((m) => (
                  <span
                    key={m.id}
                    className="flex items-center gap-1 px-2 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-full text-xs"
                  >
                    <EntityImage src={m.avatar_url} name={m.full_name} className="w-4 h-4 rounded-full text-[8px]" />
                    {m.full_name}
                    <button type="button" onClick={() => handleRemoveMember(m.phone)} className="ml-1 hover:opacity-70">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeGroupModal} className="px-4 py-2 text-sm text-[var(--color-text-muted)]">Cancel</button>
            <button
              onClick={handleCreateGroup}
              disabled={createGroupMutation.isPending || uploadAvatarMutation.isPending}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
            >
              {createGroupMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Group Settings modal */}
      <Modal open={groupSettingsOpen} onClose={closeGroupSettings} title="Group Settings">
        <div className="space-y-5">
          {/* Group Info section */}
          {canManageGroup && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Group Info</h3>
              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">Group Name</span>
                <input
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="Group name"
                  className="mt-1 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[var(--color-text-muted)]">Group Avatar</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setEditGroupAvatarFile(file);
                      setEditGroupAvatarUrl(URL.createObjectURL(file));
                    }
                  }}
                  className="mt-1 w-full text-sm text-[var(--color-text)]"
                />
                {editGroupAvatarUrl && (
                  <div className="mt-2">
                    <EntityImage src={editGroupAvatarUrl} name={editGroupName || 'Group'} className="w-16 h-16 rounded-full text-lg" />
                  </div>
                )}
              </label>
              <button
                onClick={handleSaveGroupInfo}
                disabled={updateGroupMutation.isPending || uploadAvatarMutation.isPending}
                className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
              >
                {updateGroupMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {/* Members section */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Members</h3>
            {groupMembersData ? (
              <div className="space-y-2">
                {groupMembersData.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--color-bg)]">
                    <EntityImage src={m.avatar_url} name={m.full_name} className="w-8 h-8 rounded-full text-xs shrink-0" />
                    <span className="text-sm text-[var(--color-text)] flex-1 truncate">{m.full_name}</span>
                    {m.id === groupInfo?.created_by && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                        Creator
                      </span>
                    )}
                    {m.is_admin && m.id !== groupInfo?.created_by && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                        Admin
                      </span>
                    )}
                    {isGroupCreator && m.id !== user?.id && m.id !== groupInfo?.created_by && (
                      <>
                        {m.is_admin ? (
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove admin role from ${m.full_name}?`)) {
                                demoteAdminMutation.mutate(m.id);
                              }
                            }}
                            className="text-xs text-amber-600 hover:text-amber-800 px-1"
                            title="Demote admin"
                          >
                            ↓
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (window.confirm(`Make ${m.full_name} an admin?`)) {
                                promoteAdminMutation.mutate(m.id);
                              }
                            }}
                            className="text-xs text-green-600 hover:text-green-800 px-1"
                            title="Promote to admin"
                          >
                            ↑
                          </button>
                        )}
                      </>
                    )}
                    {canManageGroup && m.id !== user?.id && m.id !== groupInfo?.created_by && !(isGroupAdmin && m.is_admin) && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${m.full_name} from the group?`)) {
                            removeMemberMutation.mutate(m.id);
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-sm font-bold px-1"
                        title="Remove member"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="animate-pulse h-10 bg-[var(--color-border)] rounded-lg" />
            )}
          </div>

          {/* Pending Invitations */}
          {pendingInvitationsData && pendingInvitationsData.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                Pending Approval ({pendingInvitationsData.length})
              </h3>
              <div className="space-y-2">
                {pendingInvitationsData.map((inv: any) => (
                  <div key={inv.id} className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <EntityImage src={inv.avatar_url} name={inv.full_name} className="w-8 h-8 rounded-full text-xs shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--color-text)] truncate">{inv.full_name}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">Invited {new Date(inv.invited_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium shrink-0">
                      Pending
                    </span>
                    {canManageGroup && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Cancel invitation for ${inv.full_name}?`)) {
                            cancelInvitationMutation.mutate(inv.id);
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-sm font-bold px-1 shrink-0"
                        title="Cancel invitation"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Member section (creator or admin) */}
          {canManageGroup && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Add Member</h3>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={addMemberPhone}
                  onChange={(e) => setAddMemberPhone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddMemberToGroup();
                    }
                  }}
                  placeholder="Phone number"
                  className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)]"
                />
                <button
                  type="button"
                  onClick={handleAddMemberToGroup}
                  disabled={groupLookupMutation.isPending || inviteMemberMutation.isPending}
                  className="px-3 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
                >
                  {groupLookupMutation.isPending || inviteMemberMutation.isPending ? '…' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Actions section */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--color-border)]">
            {!isGroupCreator && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to leave this group?')) {
                    leaveGroupMutation.mutate();
                  }
                }}
                disabled={leaveGroupMutation.isPending}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
              >
                {leaveGroupMutation.isPending ? 'Leaving…' : 'Leave Group'}
              </button>
            )}
            {isGroupCreator && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this group? This cannot be undone.')) {
                    deleteGroupMutation.mutate();
                  }
                }}
                disabled={deleteGroupMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90"
              >
                {deleteGroupMutation.isPending ? 'Deleting…' : 'Delete Group'}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ConversationItem({
  c,
  selectedId,
  onSelect,
  onPinToggle,
}: {
  c: any;
  selectedId: number | null;
  onSelect: () => void;
  onPinToggle: () => void;
}) {
  const isGroup = c.conversation_type === 'group';
  const displayName = isGroup ? c.group_name : c.other_user_name;
  const displayAvatar = isGroup ? c.group_avatar_url : c.other_user_avatar;
  const unread = c.unread_count || 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-3 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${
        selectedId === c.id ? 'bg-[var(--color-primary)]/10' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <EntityImage
          src={displayAvatar}
          name={displayName || (isGroup ? 'Group' : 'User')}
          className="w-9 h-9 rounded-full text-sm shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-1">
            <span className="flex items-center gap-1 font-medium text-sm text-[var(--color-text)] truncate">
              {displayName || (isGroup ? 'Group' : 'User')}
              {c.pinned_at && <span className="text-xs" title="Pinned">📌</span>}
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">{formatTime(c.last_message_at || c.updated_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-[var(--color-text-muted)] truncate flex-1">{c.last_message || 'No messages yet'}</p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPinToggle();
                }}
                className="text-xs opacity-40 hover:opacity-100 transition-opacity"
                title={c.pinned_at ? 'Unpin' : 'Pin'}
              >
                📌
              </button>
              {unread > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
