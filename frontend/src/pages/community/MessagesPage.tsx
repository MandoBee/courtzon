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

  const { data: conversations, isLoading: loadingConvos } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/community/conversations').then((r) => r.data?.data || []),
    enabled: can('community.chat.view'),
    refetchInterval: 15000,
  });

  const selectedConvo = conversations?.find((c: any) => c.id === selectedId);

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api.get(`/community/conversations/${selectedId}/messages`, { params: { limit: 100 } }).then((r) => r.data?.data || []),
    enabled: !!selectedId && can('community.chat.view'),
    refetchInterval: selectedId ? 4000 : false,
  });

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">💬 Messages</h1>
        <Can permission="community.chat.view">
          <button
            onClick={() => setNewOpen(true)}
            className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            + New message
          </button>
        </Can>
      </div>

      <div className="flex flex-col md:flex-row gap-4 min-h-[60vh] border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface)]">
        {/* Conversation list */}
        <aside className={`w-full md:w-80 md:max-w-xs border-b md:border-b-0 md:border-r border-[var(--color-border)] flex flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-[var(--color-border)] font-medium text-sm text-[var(--color-text-muted)]">
            Conversations
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingConvos ? (
              <div className="p-4 animate-pulse h-16 bg-[var(--color-border)] bg-[var(--color-surface)] m-2 rounded-lg" />
            ) : !conversations?.length ? (
              <p className="p-4 text-sm text-[var(--color-text-muted)]">No conversations yet. Start one with + New message.</p>
            ) : (
              conversations.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-3 border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors ${
                    selectedId === c.id ? 'bg-[var(--color-primary)]/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <EntityImage
                      src={c.other_user_avatar}
                      name={c.other_user_name || c.other_user_email || 'User'}
                      className="w-9 h-9 rounded-full text-sm shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-1">
                        <span className="font-medium text-sm text-[var(--color-text)] truncate">{c.other_user_name || 'User'}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0">{formatTime(c.last_message_at || c.updated_at)}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">{c.last_message || 'No messages yet'}</p>
                    </div>
                  </div>
                </button>
              ))
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
                <span className="font-medium text-[var(--color-text)]">
                  {selectedConvo?.other_user_name || 'Conversation'}
                </span>
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
    </div>
  );
}
