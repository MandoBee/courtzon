import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { Modal, Button, EntityImage } from '../ui';
import api from '../../services/api';
import { useToast } from '../ui/Toast';
import { formatPrice, formatPricePerHour } from '../../utils/currency';
import { useTranslation } from '../../i18n';
import PaymobPixelCard from '../payment/PaymobPixelCard';
import PaymentStatusPoller from '../payment/PaymentStatusPoller';
import { usePaymentConfirm } from '../../hooks/usePaymentConfirm';

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
}

interface Participant {
  fullName: string;
  email: string;
  phone: string;
}

const LEVELS = [
  { id: 1, name: 'Beginner' }, { id: 2, name: 'Intermediate' },
  { id: 3, name: 'Advanced' }, { id: 4, name: 'Professional' },
  { id: 5, name: 'Elite' },
];

function BranchAccessBadges({ branch }: { branch: any }) {
  const isApproved = branch.access_type === 'restricted' && branch.player_access_status === 'approved';
  const statusLabel = isApproved ? 'open' : branch.access_type.replace(/_/g, ' ');
  const statusClass =
    isApproved ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
    branch.access_type === 'open' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' :
    branch.access_type === 'restricted' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]' :
    'bg-[var(--color-error-bg)] text-[var(--color-error-text)]';

  return (
    <>
      {branch.access_type === 'restricted' && (
        <span className="px-2 py-0.5 text-xs rounded-full whitespace-nowrap bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          Members Only
        </span>
      )}
      <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${statusClass}`}>
        {statusLabel}
      </span>
    </>
  );
}

function BranchStep2Card({ branch, onSelect }: { branch: any; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-4 min-h-[6.25rem] sm:min-h-[4.75rem] hover:shadow-[var(--shadow-md)] transition-all border border-[var(--color-border)] hover:border-[var(--color-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30"
    >
      <div className="flex h-full min-h-[4.25rem] sm:min-h-0 flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="hidden sm:flex w-10 h-10 shrink-0 rounded-[var(--radius-md)] bg-[var(--color-primary)]/10 items-center justify-center text-lg"
            aria-hidden
          >
            📍
          </div>
          <div className="min-w-0">
            <h4 className="font-medium text-[var(--color-text)] leading-snug line-clamp-2">{branch.name}</h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">{branch.city || 'Location TBD'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0 mt-auto sm:mt-0 border-t border-[var(--color-border)] sm:border-0 sm:shrink-0 sm:justify-end min-h-[1.75rem]">
          <BranchAccessBadges branch={branch} />
        </div>
      </div>
    </button>
  );
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ResourceCard({ resource, date, isRestricted, selectedSlots, selectedResourceId, onSelectResource, onToggleSlot }: {
  resource: any;
  date: string;
  isRestricted: boolean;
  selectedSlots: string[];
  selectedResourceId: number | null;
  onSelectResource: (id: number) => void;
  onToggleSlot: (time: string, status: string) => void;
}) {
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['resource-slots', resource.id, date],
    queryFn: () => api.get(`/resources/${resource.id}/slots?date=${date}`).then((r) => r.data.data),
    enabled: !!resource.id && !!date,
  });

  const slots: { slot_start: string; slot_end: string; status: string; dayOffset?: number; businessDate?: string; startAtUtc?: string; utcOffsetMinutes?: number }[] = slotsData || [];
  const isThisResourceSelected = selectedResourceId === resource.id;

  const getSlotStatus = (time: string): 'expired' | 'booked' | 'available' | 'selected' => {
    const slot = slots.find((s) => s.slot_start === time);
    if (!slot) return 'expired';
    if (slot.status === 'booked') return 'booked';
    if (isThisResourceSelected && selectedSlots.includes(time)) return 'selected';
    if (slot.status === 'available') return 'available';
    return 'expired';
  };

  const slotColor = (status: string) => {
    switch (status) {
      case 'expired': return 'bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed';
      case 'booked': return 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] cursor-not-allowed';
      case 'selected': return 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]';
      case 'available': return 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:border-[var(--color-primary)] cursor-pointer border-[var(--color-border)]';
      default: return 'bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed';
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] border border-[var(--color-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => !isRestricted && resource.is_active && onSelectResource(resource.id)}
        disabled={isRestricted || !resource.is_active}
        className="w-full text-left p-4 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-[var(--color-text)]">{resource.name}</h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {resource.resource_type_name}
              {resource.hourly_price ? ` · ${formatPricePerHour(Number(resource.hourly_price))}` : ''}
              {resource.opening_time && resource.closing_time ? ` · ${resource.opening_time?.slice(0, 5)}–${resource.closing_time?.slice(0, 5)}` : ''}
            </p>
          </div>
          <span className={`px-2 py-0.5 text-xs rounded-full ${resource.is_active ? 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]' : 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]'}`}>
            {resource.is_active ? 'Active' : 'Maintenance'}
          </span>
        </div>
      </button>

      {resource.is_active && !isRestricted && (
        <div className="px-4 pb-3 border-t border-[var(--color-border)] pt-2">
          {slotsLoading ? (
            <p className="text-[10px] text-[var(--color-text-muted)] animate-pulse">Loading slots...</p>
          ) : slots.length === 0 ? (
            <p className="text-[10px] text-[var(--color-text-muted)]">No slots available</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {slots.map((slot) => {
                const status = getSlotStatus(slot.slot_start);
                const isOvernight = slot.businessDate && slot.businessDate !== date;
                return (
                  <div key={slot.slot_start} className="relative">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onToggleSlot(slot.slot_start, status); }}
                      disabled={status === 'booked' || status === 'expired'}
                      className={`px-2 py-0.5 text-[10px] rounded-[var(--radius-sm)] border transition-colors ${slotColor(status)}`}
                    >
                      {slot.slot_start}
                    </button>
                    {isOvernight && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--color-warning)]" title="Belongs to previous Business Day" />
                    )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BookingModal({ open, onClose }: BookingModalProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const { state: confirmState, confirm: confirmPayment } = usePaymentConfirm();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [selectedSportId, setSelectedSportId] = useState<number | null>(user?.mainSportId || null);
  const [selectedDate, setSelectedDate] = useState(toLocalDateStr(new Date()));
  const [selectedBranch, setSelectedBranch] = useState<any | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'online'>('card');
  const [notes, setNotes] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [bookingType, setBookingType] = useState<'public_match' | 'private_match'>('private_match');
  const [matchmakingMinAge, setMatchmakingMinAge] = useState('');
  const [matchmakingMaxAge, setMatchmakingMaxAge] = useState('');
  const [matchmakingGender, setMatchmakingGender] = useState<'male' | 'female' | 'any'>('any');
  const [matchmakingLevelId, setMatchmakingLevelId] = useState<number | ''>('');
  const [matchmakingMaxPlayers, setMatchmakingMaxPlayers] = useState(2);
  const [matchmakingDeadline, setMatchmakingDeadline] = useState('');
  const [matchmakingAutoApply, setMatchmakingAutoApply] = useState(false);
  const [pendingAccessBranches, setPendingAccessBranches] = useState<Record<number, boolean>>({});
  const [pixelClientSecret, setPixelClientSecret] = useState<string | null>(null);
  const [pollingPaid, setPollingPaid] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<number | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);

  const requestAccessMutation = useMutation({
    mutationFn: (branchId: number) => api.post(`/branches/${branchId}/request-access`),
    onSuccess: (_data, branchId) => {
      setPendingAccessBranches((prev) => ({ ...prev, [branchId]: true }));
      showToast('Access request sent to admin', 'info');
    },
    onError: (err: any) => {
      showToast(err?.response?.data?.message || 'Failed to request access', 'error');
    },
  });

  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: () => api.get('/sports').then((r) => r.data),
    enabled: open,
  });

  const { data: branchesData } = useQuery({
    queryKey: ['branches-by-sport', selectedSportId],
    queryFn: () => api.get(`/branches?sportId=${selectedSportId}`).then((r) => r.data.data),
    enabled: open && !!selectedSportId,
  });

  const { data: branchDetail } = useQuery({
    queryKey: ['branch', selectedBranch?.id],
    queryFn: () => api.get(`/branches/${selectedBranch.id}`).then((r) => r.data),
    enabled: open && !!selectedBranch && step >= 3,
  });

  const { data: myAccessData } = useQuery({
    queryKey: ['my-access', selectedBranch?.id],
    queryFn: () => api.get(`/branches/${selectedBranch.id}/my-access`).then((r) => r.data),
    enabled: open && !!selectedBranch,
  });

  const { data: resources } = useQuery({
    queryKey: ['branch-resources', selectedBranch?.id],
    queryFn: () => api.get(`/branches/${selectedBranch.id}/resources`).then((r) => r.data.data),
    enabled: open && !!selectedBranch && step >= 3,
  });

  // Convert user's selected date to the branch's timezone so the backend
  // receives the date it expects (the date in the branch's own timezone).
  const branchTimezone = selectedBranch?.timezone || 'Africa/Cairo';
  const userToday = toLocalDateStr(new Date());
  const branchToday = getDateInTimezone(branchTimezone);
  const dayOffsetBetweenTimezones = Math.round(
    (new Date(branchToday + 'T00:00:00Z').getTime() - new Date(userToday + 'T00:00:00Z').getTime()) / 86400000
  );
  const apiDate = dayOffsetBetweenTimezones === 0
    ? selectedDate
    : addDaysToDate(selectedDate, dayOffsetBetweenTimezones);

  const { data: slotsData } = useQuery({
    queryKey: ['resource-slots', selectedResourceId, apiDate],
    queryFn: () => api.get(`/resources/${selectedResourceId}/slots?date=${apiDate}`).then((r) => r.data.data),
    enabled: open && !!selectedResourceId && !!apiDate && step >= 4,
  });

  const sportsList = sports || [];
  const branches = branchesData || [];
  const branchResources = (resources || []).filter((r: any) =>
    r.sport_id === selectedSportId
  );
  const slots: { slot_start: string; slot_end: string; status: string; dayOffset?: number; businessDate?: string; startAtUtc?: string; utcOffsetMinutes?: number }[] = slotsData || [];

  const selectedResource = branchResources.find((r: any) => r.id === selectedResourceId);

  const bookingMutation = useMutation({
    mutationFn: (data: any) => api.post('/bookings', data),
    onSuccess: (res) => {
      const d = res.data;
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      if (selectedResourceId && apiDate) {
        queryClient.invalidateQueries({ queryKey: ['resource-slots', selectedResourceId, apiDate] });
      }
      if (d.clientSecret && d.intentId) {
        setPendingBookingId(d.intentId);
        setPaymentId(d.paymentId || null);
        setPixelClientSecret(d.clientSecret);
      } else if (d.id) {
        onClose();
        showToast('Booking confirmed!');
        navigate(`/bookings/${d.id}/confirmation`, { state: { qrToken: d.qrToken } });
      }
    },
    onError: (err) => {
      showToast('Booking failed: ' + ((err as any)?.response?.data?.message || (err as any).message), 'error');
    },
  });

  const reset = () => {
    setStep(1);
    setSelectedSportId(user?.mainSportId || null);
    setSelectedDate(toLocalDateStr(new Date()));
    setSelectedBranch(null);
    setSelectedResourceId(null);
    setSelectedSlots([]);
    setPaymentMethod('card');
    setNotes('');
    setParticipants([]);
    setBookingType('public_match');
    setMatchmakingMinAge('');
    setMatchmakingMaxAge('');
    setMatchmakingGender('any');
    setMatchmakingLevelId('');
    setMatchmakingMaxPlayers(2);
    setMatchmakingDeadline('');
    setMatchmakingAutoApply(false);
    setPendingAccessBranches({});
    setPendingBookingId(null);
    setPaymentId(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (selectedSlots.length > 0 && apiDate) {
      const [h, m] = selectedSlots[0].split(':').map(Number);
      const start = new Date(apiDate);
      start.setHours(h, m, 0, 0);
      const deadline = new Date(start.getTime() - 4 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setMatchmakingDeadline(
        `${deadline.getFullYear()}-${pad(deadline.getMonth() + 1)}-${pad(deadline.getDate())}T${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`
      );
    }
  }, [selectedSlots, apiDate]);

  const handleSportSelect = (id: number) => {
    setSelectedSportId(id);
    setStep(2);
  };

  const handleBranchSelect = (branch: any) => {
    setSelectedBranch(branch);
    setSelectedResourceId(null);
    setSelectedSlots([]);
    setStep(3);
  };

  const handleSelectResource = (resourceId: number) => {
    setSelectedResourceId(resourceId);
    setSelectedSlots([]);
    setStep(4);
  };

  const getSlotStatus = (time: string): 'expired' | 'booked' | 'available' | 'selected' => {
    const slot = slots.find((s) => s.slot_start === time);
    if (!slot) return 'expired';
    if (slot.status === 'booked') return 'booked';
    if (selectedSlots.includes(time)) return 'selected';
    if (slot.status === 'available') return 'available';
    return 'expired';
  };

  const handleSlotClick = (time: string) => {
    const status = getSlotStatus(time);
    if (status === 'booked' || status === 'expired') return;

    const slotIndices = slots
      .filter((s) => s.status === 'available' || selectedSlots.includes(s.slot_start))
      .map((s) => s.slot_start)
      .sort();

    if (selectedSlots.includes(time)) {
      const idx = selectedSlots.indexOf(time);
      setSelectedSlots(selectedSlots.slice(0, idx));
      return;
    }

    if (selectedSlots.length === 0) {
      setSelectedSlots([time]);
      return;
    }

    const firstIdx = slotIndices.indexOf(selectedSlots[0]);
    const lastIdx = slotIndices.indexOf(selectedSlots[selectedSlots.length - 1]);
    const clickIdx = slotIndices.indexOf(time);

    if (clickIdx === lastIdx + 1) {
      setSelectedSlots([...selectedSlots, time]);
    } else if (clickIdx === firstIdx - 1) {
      setSelectedSlots([time, ...selectedSlots]);
    } else {
      setSelectedSlots([time]);
    }
  };

  const getSlotColor = (status: string) => {
    switch (status) {
      case 'expired': return 'bg-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] dark:text-[var(--color-text-muted)] cursor-not-allowed';
      case 'booked': return 'bg-[var(--color-error-bg)] text-[var(--color-error-text)] dark:bg-red-900/30 dark:text-red-400 cursor-not-allowed';
      case 'selected': return 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]';
      case 'available': return 'bg-[var(--color-success-bg)] text-[var(--color-success-text)] hover:border-[var(--color-primary)] cursor-pointer';
      default: return 'bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed';
    }
  };

  const calcPrice = () => {
    if (!selectedResource || !selectedSlots.length) return 0;
    const duration = selectedResource.slot_duration || selectedResource.default_slot_duration || 60;
    const hours = (selectedSlots.length * duration) / 60;
    const price = Number(selectedResource.hourly_price) || 0;
    return hours * price;
  };

  const totalPrice = calcPrice();
  const selectedHours = selectedSlots.length * ((selectedResource?.slot_duration || selectedResource?.default_slot_duration || 60) / 60);

  const handleSubmit = () => {
    if (!selectedBranch || !selectedResourceId || !selectedSlots.length) return;

    if (bookingType === 'public_match' && matchmakingDeadline) {
      const bookingStart = new Date(`${apiDate}T${selectedSlots[0]}`);
      const deadline = new Date(matchmakingDeadline);
      if (deadline >= bookingStart) {
        showToast('Matchmaking deadline must be before the booking start time', 'error');
        return;
      }
    }

    const payload: any = {
      branchId: selectedBranch.id,
      resourceId: selectedResourceId,
      bookingType,
      bookingDate: apiDate,
      startTime: selectedSlots[0],
      endTime: (() => {
        const last = selectedSlots[selectedSlots.length - 1];
        const [h, m] = last.split(':').map(Number);
        const duration = selectedResource?.slot_duration || selectedResource?.default_slot_duration || 60;
        const totalMinutes = h * 60 + m + duration;
        return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
      })(),
      paymentMethod,
      returnUrl: window.location.origin + '/bookings',
      notes: notes || undefined,
    };
    if (bookingType === 'private_match') {
      if (participants.length) {
        payload.participants = participants.filter((p) => p.phone);
      }
    }
    if (bookingType === 'public_match') {
      payload.matchmaking = {
        minAge: matchmakingMinAge ? Number(matchmakingMinAge) : undefined,
        maxAge: matchmakingMaxAge ? Number(matchmakingMaxAge) : undefined,
        targetGender: matchmakingGender,
        targetLevelId: matchmakingLevelId || undefined,
        maxPlayers: matchmakingMaxPlayers,
        deadline: matchmakingDeadline ? `${matchmakingDeadline}:00Z` : undefined,
        autoApply: matchmakingAutoApply,
      };
    }
    bookingMutation.mutate(payload);
  };

  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return toLocalDateStr(d);
  });

  const dateLabels = ['Today', 'Tomorrow', ...Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 2);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  })];

  const isRestricted = selectedBranch?.access_type === 'restricted' && myAccessData?.status !== 'approved';

  const addParticipant = () => {
    setParticipants([...participants, { fullName: '', email: '', phone: '' }]);
  };

  const updateParticipant = (idx: number, field: keyof Participant, value: string) => {
    const updated = [...participants];
    updated[idx] = { ...updated[idx], [field]: value };
    setParticipants(updated);
  };

  const removeParticipant = (idx: number) => {
    setParticipants(participants.filter((_, i) => i !== idx));
  };

  return (
    <>
    <Modal open={open} onClose={handleClose} size="xl">
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4, 5, 6].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface)]'}`} />
        ))}
      </div>

      {/* Step 1: Sport Selection */}
      {step === 1 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Step 1: What sport would you like to play?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sportsList.map((sport: any) => (
              <button
                key={sport.id}
                onClick={() => handleSportSelect(sport.id)}
                className={`p-4 rounded-[var(--radius-md)] border-2 text-center transition-all ${
                  selectedSportId === sport.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                }`}
              >
                {sport.icon && sport.icon.startsWith('/uploads/') ? (
                  <EntityImage src={sport.icon} name={sport.name || 'Sport'} className="w-8 h-8 rounded mx-auto mb-1 text-lg" />
                ) : (
                  <span className="text-2xl block mb-1">{sport.icon || '⚽'}</span>
                )}
                <span className="text-sm font-medium text-[var(--color-text)]">{sport.name}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end pt-6 border-t border-[var(--color-border)]">
            <Button variant="ghost" type="button" onClick={handleClose}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}

      {/* Step 2: Date + Filtered Branches */}
      {step === 2 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">Step 2: Pick a date</h3>

          <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
            {dateOptions.map((d, i) => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`shrink-0 px-4 py-3 rounded-[var(--radius-md)] border text-center min-w-[72px] transition-colors ${
                  selectedDate === d
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)]'
                }`}
              >
                <div className="text-xs font-medium">{dateLabels[i]}</div>
                <div className="text-lg font-bold">{d.slice(8)}</div>
              </button>
            ))}
          </div>

          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            {branches.length} branch{branches.length !== 1 ? 'es' : ''} available on this date for the selected sport
          </p>

          <div className="space-y-3">
            {branches.map((branch: any) => (
              <BranchStep2Card
                key={branch.id}
                branch={branch}
                onSelect={() => handleBranchSelect(branch)}
              />
            ))}
            {!branches.length && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No branches available for this sport on this date</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-[var(--color-border)]">
            <Button variant="ghost" type="button" onClick={handleClose}>{t('common.cancel')}</Button>
            <Button variant="secondary" type="button" onClick={() => setStep(1)}>{t('common.back')}</Button>
          </div>
        </div>
      )}

      {/* Step 3: Branch → Resources */}
      {step === 3 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              Step 3: Select a court at {branchDetail?.name || selectedBranch?.name}
            </h3>
            {isRestricted && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]">{t('common.restricted')}</span>
            )}
          </div>

          {isRestricted && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-[var(--radius-md)] p-4 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">Restricted Branch</p>
              <p className="text-xs text-[var(--color-warning-text)] dark:text-yellow-300 mt-1">
                This branch requires approval to book. Please contact the facility or request access from the admin.
              </p>
              {pendingAccessBranches[selectedBranch?.id] || requestAccessMutation.isSuccess ? (
                <p className="mt-3 text-xs text-[var(--color-warning-text)] dark:text-yellow-300 font-medium">
                  ✓ Your access request is pending approval
                </p>
              ) : (
                <button
                  onClick={() => requestAccessMutation.mutate(selectedBranch.id)}
                  disabled={requestAccessMutation.isPending}
                  className="mt-3 px-4 py-1.5 text-xs font-medium bg-yellow-600 text-white rounded-[var(--radius-md)] hover:bg-yellow-700 disabled:opacity-50"
                >
                  {requestAccessMutation.isPending ? 'Sending...' : 'Request Access'}
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {branchResources.map((resource: any) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                date={apiDate}
                isRestricted={isRestricted}
                selectedSlots={selectedSlots}
                selectedResourceId={selectedResourceId}
                onSelectResource={handleSelectResource}
                onToggleSlot={(time, status) => {
                  if (status === 'booked' || status === 'expired') return;
                  if (selectedResourceId !== resource.id) {
                    setSelectedResourceId(resource.id);
                    setSelectedSlots([time]);
                    return;
                  }
                  handleSlotClick(time);
                }}
              />
            ))}
            {!branchResources.length && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No courts available at this branch</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-[var(--color-border)]">
            <Button variant="ghost" type="button" onClick={handleClose}>{t('common.cancel')}</Button>
            <div className="flex gap-2">
              <Button variant="secondary" type="button" onClick={() => { setStep(2); setSelectedBranch(null); setSelectedResourceId(null); }}>{t('common.back')}</Button>
              {selectedSlots.length > 0 && selectedResourceId && (
                <Button type="button" onClick={() => setStep(5)}>{t('common.next')}</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Resource Preview → Slot Selection */}
      {step === 4 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">
            Step 4: Select time slots at {selectedResource?.name}
          </h3>
          {selectedBranch?.timezone && (
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              Times shown in {selectedBranch.timezone} · Current Business Day: {apiDate}
            </p>
          )}

          <div className="flex gap-2 mb-3 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[var(--color-success-bg)] inline-block" /> Available</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[var(--color-error-bg)] dark:bg-red-900/30 inline-block" /> Booked</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[var(--color-border)] bg-[var(--color-surface)] inline-block" /> Expired</span>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {slots.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">{t('booking.loading_slots')}</p>}
            {(() => {
              const sameDay = slots.filter((s: any) => !s.businessDate || s.businessDate === apiDate);
              const overnight = slots.filter((s: any) => s.businessDate && s.businessDate !== apiDate);
              return (
                <>
                  {sameDay.map((slot: any) => {
                    const st = slot.slot_start;
                    const status = getSlotStatus(st);
                    return (
                      <button key={st} type="button" onClick={() => handleSlotClick(st)}
                        disabled={status === 'booked' || status === 'expired'}
                        className={`px-2 py-1 text-xs rounded-[var(--radius-sm)] border transition-colors ${getSlotColor(status)}`}>
                        {st}
                      </button>
                    );
                  })}
                  {overnight.length > 0 && (
                    <div className="w-full text-[10px] text-[var(--color-text-muted)] mt-1 mb-0.5 border-t border-dashed border-[var(--color-border)] pt-1">
                      Continues from {apiDate} ↓
                    </div>
                  )}
                  {overnight.map((slot: any) => {
                    const st = slot.slot_start;
                    const status = getSlotStatus(st);
                    return (
                      <button key={st} type="button" onClick={() => handleSlotClick(st)}
                        disabled={status === 'booked' || status === 'expired'}
                        className={`px-2 py-1 text-xs rounded-[var(--radius-sm)] border transition-colors ${getSlotColor(status)}`}
                        title={`Belongs to Business Day ${slot.businessDate || apiDate}`}>
                        {st}
                      </button>
                    );
                  })}
                </>
              );
            })()}
          </div>

          {selectedSlots.length > 0 && (
            <div className="bg-[var(--color-bg)] rounded-[var(--radius-lg)] p-3 mb-4 flex items-center justify-between">
              <span className="text-sm text-[var(--color-text)]">
                {selectedSlots[0]} - {(() => {
                  const last = selectedSlots[selectedSlots.length - 1];
                  const [h, m] = last.split(':').map(Number);
                  const duration = selectedResource?.slot_duration || selectedResource?.default_slot_duration || 60;
                  const totalMinutes = h * 60 + m + duration;
                  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
                })()}
              </span>
              <span className="text-sm font-semibold text-[var(--color-primary)]">
                {selectedHours.toFixed(1)}h · {formatPrice(totalPrice)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-6 border-t border-[var(--color-border)]">
            <Button variant="ghost" type="button" onClick={handleClose}>{t('common.cancel')}</Button>
            <div className="flex gap-2">
              <Button variant="secondary" type="button" onClick={() => { setStep(3); setSelectedResourceId(null); }}>{t('common.back')}</Button>
              <Button
                type="button"
                disabled={selectedSlots.length === 0 || isRestricted}
                onClick={() => setStep(5)}
              >
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Booking Type + Payment & Confirm */}
      {step === 5 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4">{t('booking.step_confirm')}</h3>

          <div className="bg-[var(--color-bg)] rounded-[var(--radius-lg)] p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{t('booking.branch')}</span>
              <span className="text-[var(--color-text)] font-medium">{branchDetail?.name || selectedBranch?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{t('booking.court')}</span>
              <span className="text-[var(--color-text)] font-medium">{selectedResource?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{t('common.date')}</span>
              <span className="text-[var(--color-text)] font-medium">{new Date(selectedDate).toLocaleDateString('en-GB')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{t('common.time')}</span>
              <span className="text-[var(--color-text)] font-medium">
                {selectedSlots[0]} - {(() => {
                  const last = selectedSlots[selectedSlots.length - 1];
                  const [h, m] = last.split(':').map(Number);
                  const duration = selectedResource?.slot_duration || selectedResource?.default_slot_duration || 60;
                  const totalMinutes = h * 60 + m + duration;
                  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
                })()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{t('booking.duration')}</span>
              <span className="text-[var(--color-text)] font-medium">{selectedHours.toFixed(1)} hours</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-[var(--color-border)]">
              <span className="text-[var(--color-text)] font-semibold">{t('common.total')}</span>
              <span className="text-lg font-bold text-[var(--color-primary)]">{formatPrice(totalPrice)}</span>
            </div>
          </div>

          {/* Booking Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Match Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBookingType('public_match')}
                className={`p-3 rounded-[var(--radius-md)] border text-left transition-colors ${
                  bookingType === 'public_match'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                }`}
              >
                <span className="text-lg">🌐</span>
                <p className="text-sm font-medium text-[var(--color-text)]">Find Players</p>
                <p className="text-xs text-[var(--color-text-muted)]">Find players to join you</p>
              </button>
              <button
                type="button"
                onClick={() => setBookingType('private_match')}
                className={`p-3 rounded-[var(--radius-md)] border text-left transition-colors ${
                  bookingType === 'private_match'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                }`}
              >
                <span className="text-lg">🔒</span>
                <p className="text-sm font-medium text-[var(--color-text)]">Private Booking</p>
                <p className="text-xs text-[var(--color-text-muted)]">Just you and your known guests</p>
              </button>
            </div>
          </div>

          {/* Public Match — Matchmaking Criteria */}
          {bookingType === 'public_match' && (
            <div className="mb-4 p-4 border border-[var(--color-border)] bg-[var(--color-info-bg)] rounded-[var(--radius-lg)]">
              <p className="text-sm font-medium text-[var(--color-text)] mb-3">🎯 Looking for Players — Criteria</p>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Min Age</label>
                  <input type="number" value={matchmakingMinAge}
                    onChange={(e) => setMatchmakingMinAge(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                    placeholder="18" min="10" max="100" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Max Age</label>
                  <input type="number" value={matchmakingMaxAge}
                    onChange={(e) => setMatchmakingMaxAge(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                    placeholder="60" min="10" max="100" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">{t('common.gender')}</label>
                  <select value={matchmakingGender}
                    onChange={(e) => setMatchmakingGender(e.target.value as any)}
                    className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                    <option value="any">{t('common.any')}</option>
                    <option value="male">{t('common.male')}</option>
                    <option value="female">{t('common.female')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Main Level</label>
                  <select value={matchmakingLevelId}
                    onChange={(e) => setMatchmakingLevelId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]">
                    <option value="">Any</option>
                    {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Max Players</label>
                <input type="number" value={matchmakingMaxPlayers}
                  onChange={(e) => setMatchmakingMaxPlayers(Math.max(2, Number(e.target.value)))}
                  className="w-full max-w-[12rem] px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                  min="2" max="50" />
              </div>

              <div className="mb-3">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Application deadline</label>
                <input
                  type="datetime-local"
                  value={matchmakingDeadline}
                  onChange={(e) => setMatchmakingDeadline(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                />
                {selectedSlots.length > 0 && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    Must be before {selectedDate} {selectedSlots[0]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs text-[var(--color-text-muted)] mb-2">Application Mode</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="autoApply" checked={!matchmakingAutoApply}
                      onChange={() => setMatchmakingAutoApply(false)}
                      className="text-[var(--color-primary)]" />
                    <span className="text-sm text-[var(--color-text)]">Self-apply (I accept/reject)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="autoApply" checked={matchmakingAutoApply}
                      onChange={() => setMatchmakingAutoApply(true)}
                      className="text-[var(--color-primary)]" />
                    <span className="text-sm text-[var(--color-text)]">Auto-apply (auto-accept)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Private Match — Participants (phone only) */}
          {bookingType === 'private_match' && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-[var(--color-text)]">Participants (add by phone)</label>
                <button
                  type="button"
                  onClick={addParticipant}
                  className="text-xs text-[var(--color-primary)] hover:underline"
                >
                  + Add Participant
                </button>
              </div>
              {participants.map((p, idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-start">
                  <input
                    value={p.phone}
                    onChange={(e) => updateParticipant(idx, 'phone', e.target.value)}
                    placeholder={t('booking.phone_placeholder')}
                    className="flex-1 px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
                  />
                  <button
                    type="button"
                    onClick={() => removeParticipant(idx)}
                    className="text-xs text-[var(--color-error)] mt-2 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text)]"
              placeholder={t('booking.special_requests')}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--color-text)] mb-2">Payment Method</label>
            <div className="flex gap-2">
              {[
                { value: 'cash', label: 'Cash', icon: '💵' },
                { value: 'card', label: 'Card', icon: '💳' },
                { value: 'online', label: 'Online', icon: '🌐' },
              ].map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value as any)}
                  className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-[var(--radius-md)] border transition-colors ${
                    paymentMethod === m.value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                  }`}
                >
                  <span className="text-sm">{m.icon}</span>
                  <span className="text-xs font-medium text-[var(--color-text)]">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {bookingMutation.isError && (
            <p className="text-sm text-[var(--color-error)] mb-3">
              {(bookingMutation.error as any)?.response?.data?.message || 'Booking failed'}
            </p>
          )}

          <div className="flex items-center justify-between pt-6 border-t border-[var(--color-border)]">
            <Button variant="ghost" type="button" onClick={handleClose}>{t('common.cancel')}</Button>
            <div className="flex gap-2">
              <Button variant="secondary" type="button" onClick={() => setStep(4)}>{t('common.back')}</Button>
              <Button
                type="button"
                loading={bookingMutation.isPending}
                onClick={handleSubmit}
              >
                {paymentMethod === 'cash' ? t('common.confirm') : t('booking.confirm_pay')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>

      {/* Payment confirming overlay (usePaymentConfirm hook state) */}
      {(confirmState === 'confirming' || confirmState === 'polling') && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center">
          <div className="bg-[var(--color-surface)] rounded-xl shadow-xl p-6 text-center space-y-3">
            <div className="animate-spin w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {confirmState === 'confirming' ? 'Verifying payment...' : 'Waiting for confirmation...'}
            </p>
          </div>
        </div>
      )}

      {/* Payment confirming overlay (fallback polling) */}
      {pollingPaid && paymentId && (
        <PaymentStatusPoller
          endpoint={`/payments/status/${paymentId}`}
          isComplete={(data: any) => !!data?.bookingId && data?.paymentStatus === 'paid'}
          interval={1500}
          timeout={90000}
          onPaid={(data: any) => {
            setPollingPaid(false);
            onClose();
            showToast('Booking confirmed!');
            navigate(`/bookings/${data.bookingId}/confirmation`, { state: { qrToken: '' } });
          }}
          onTimeout={() => {
            setPollingPaid(false);
            onClose();
            showToast('Payment confirmation is taking longer than expected.', 'warning');
          }}
        />
      )}

      {/* Card payment modal */}
      <Modal open={!!pixelClientSecret} onClose={async () => {
        const intentId = pendingBookingId;
        setPixelClientSecret(null);
        try {
          await api.post(`/booking-intents/${intentId}/cancel`);
        } catch {}
        showToast('Payment cancelled', 'warning');
      }} title="Pay with Card" size="lg">
        {pixelClientSecret && (
          <PaymobPixelCard
            clientSecret={pixelClientSecret}
            onComplete={async () => {
              setPixelClientSecret(null);
              showToast('Payment submitted — confirming...', 'info');
              const pmId = paymentId;
              const intentId = pendingBookingId;

              // Step 1: Try to confirm payment with Paymob
              let confirmed = false;
              let bookingId: number | null = null;
              if (pmId) {
                const result = await confirmPayment(pmId);
                confirmed = result.confirmed;
                bookingId = result.data?.bookingId || null;
              }

              // Step 2: Always fulfill the intent to create the booking (even if pending)
              if (intentId && !bookingId) {
                try {
                  const fulfillRes = await api.post(`/booking-intents/${intentId}/fulfill`);
                  bookingId = fulfillRes.data?.booking?.id || null;
                } catch {}
              }

              if (confirmed || bookingId) {
                onClose();
                if (bookingId) {
                  showToast('Booking confirmed!');
                  queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
                  navigate(`/bookings/${bookingId}/confirmation`, { state: { qrToken: '' } });
                }
                return;
              }

              // Fall back to polling (webhook will complete)
              setPollingPaid(true);
            }}
            onCancel={async () => {
              const intentId = pendingBookingId;
              setPixelClientSecret(null);
              try {
                await api.post(`/booking-intents/${intentId}/cancel`);
              } catch { /* non-fatal */ }
              showToast('Payment cancelled', 'warning');
            }}
          />
        )}
      </Modal>
    </>
  );
}
