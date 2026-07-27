import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../services/api';
import { useCan } from '../../../hooks/useCan';
import { useToast } from '../../../components/ui/Toast';

const STATUS_BADGES: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  waiting_on_customer: 'bg-purple-100 text-purple-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

interface Props {
  ticketId: number;
  onClose: () => void;
}

export default function SupportTicketDetail({ ticketId, onClose }: Props) {
  const { can } = useCan();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [assignUserId, setAssignUserId] = useState('');

  const { data: ticketData } = useQuery({
    queryKey: ['admin-support-ticket', ticketId],
    queryFn: () => api.get(`/admin/support/tickets/${ticketId}`).then((r) => r.data),
  });

  const { data: messagesData } = useQuery({
    queryKey: ['admin-support-ticket-messages', ticketId],
    queryFn: () => api.get(`/admin/support/tickets/${ticketId}/messages`).then((r) => r.data),
  });

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-select'],
    queryFn: () => api.get('/admin/users?limit=100').then((r) => r.data),
    enabled: can('support.tickets.manage'),
  });

  const ticket = ticketData?.data;
  const messages = messagesData?.data || [];
  const users = usersData?.data || [];

  const sendMessageMutation = useMutation({
    mutationFn: ({ message, isInternal: internal }: { message: string; isInternal: boolean }) =>
      api.post(`/admin/support/tickets/${ticketId}/messages`, { message, isInternal: internal }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-ticket-messages', ticketId] });
      setNewMessage('');
      setIsInternal(false);
      showToast('Message added');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to send message', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      api.put(`/admin/support/tickets/${ticketId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-ticket', ticketId] });
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
      showToast('Ticket updated');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to update ticket', 'error'),
  });

  const assignMutation = useMutation({
    mutationFn: (assignedTo: number) =>
      api.post(`/admin/support/tickets/${ticketId}/assign`, { assignedTo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-support-ticket', ticketId] });
      showToast('Ticket assigned');
    },
    onError: (err: any) => showToast(err?.response?.data?.message || 'Failed to assign ticket', 'error'),
  });

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    sendMessageMutation.mutate({ message: newMessage.trim(), isInternal });
  };

  const handleUpdate = () => {
    const data: Record<string, string> = {};
    if (editStatus) data.status = editStatus;
    if (editPriority) data.priority = editPriority;
    if (Object.keys(data).length) updateMutation.mutate(data);
  };

  const handleAssign = () => {
    if (assignUserId) assignMutation.mutate(Number(assignUserId));
  };

  if (!ticket) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="animate-pulse h-8 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="animate-pulse h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold truncate mr-4">{ticket.subject}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase">Status</label>
              <div>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGES[ticket.status] || ''}`}>
                  {ticket.status?.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Priority</label>
              <div className="text-sm font-medium">{ticket.priority}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Category</label>
              <div className="text-sm font-medium">{ticket.category?.replace(/_/g, ' ')}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Assignee</label>
              <div className="text-sm font-medium">{ticket.assignee_name || 'Unassigned'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Created by</label>
              <div className="text-sm">{ticket.user_name || ticket.user_email}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Organisation</label>
              <div className="text-sm">{ticket.organisation_name || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Created</label>
              <div className="text-sm">{new Date(ticket.created_at).toLocaleString()}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase">Updated</label>
              <div className="text-sm">{new Date(ticket.updated_at).toLocaleString()}</div>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 uppercase mb-1 block">Description</label>
            <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap">{ticket.description}</div>
          </div>

          {can('support.tickets.manage') && (
            <div className="border rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-sm">Management</h3>
              <div className="flex flex-wrap gap-3">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                >
                  <option value="">Change status...</option>
                  {['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</option>
                  ))}
                </select>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm"
                >
                  <option value="">Change priority...</option>
                  {['low', 'normal', 'high', 'urgent'].map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <button onClick={handleUpdate} className="bg-[var(--color-primary)] text-white px-3 py-1.5 rounded text-sm">
                  Apply
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <select
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="border rounded px-3 py-1.5 text-sm flex-1"
                >
                  <option value="">Assign to...</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
                <button onClick={handleAssign} className="bg-[var(--color-primary)] text-white px-3 py-1.5 rounded text-sm">
                  Assign
                </button>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-medium mb-3">Messages</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-400">No messages yet</p>
              ) : (
                messages.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg p-3 text-sm ${msg.is_internal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-xs">{msg.user_name || msg.user_email}</span>
                      <div className="flex items-center gap-2">
                        {msg.is_internal && (
                          <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">Internal Note</span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))
              )}
            </div>

            {can('support.tickets.manage') && (
              <div className="space-y-2">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  rows={3}
                  className="w-full border rounded p-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    Internal note (admin only)
                  </label>
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sendMessageMutation.isPending}
                    className="ml-auto bg-[var(--color-primary)] text-white px-4 py-1.5 rounded text-sm disabled:opacity-50"
                  >
                    {sendMessageMutation.isPending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
