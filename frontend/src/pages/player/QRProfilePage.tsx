import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '../../i18n';
import { useToast } from '../../components/ui/Toast';
import { SkeletonRow } from '../../components/ui/Skeleton';
import api from '../../services/api';
import { EntityImage } from '../../components/ui/EntityImage';
import QRCode from 'qrcode';

export default function QRProfilePage() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const { data: qrProfile, isLoading } = useQuery({
    queryKey: ['my', 'qr-profile'],
    queryFn: () => api.get('/players/my/qr-profile').then((r) => r.data?.data || r.data || {}),
  });

  const p: any = qrProfile || {};

  const profileUrl = useMemo(() => {
    if (p.profileUrl || p.profile_url) return p.profileUrl || p.profile_url;
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/players/${p.id || p.playerId || ''}`;
  }, [p]);

  const qrDataUrl = useMemo(() => {
    if (!profileUrl) return '';
    let result = '';
    QRCode.toDataURL(profileUrl, { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((url: string) => { result = url; })
      .catch(() => {});
    return result;
  }, [profileUrl]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: p.full_name || p.fullName || t('player.player'), url: profileUrl });
      } catch {}
    } else {
      await navigator.clipboard.writeText(profileUrl);
      showToast(t('player.link_copied'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 flex flex-col items-center py-8">
        <div className="w-48 h-48 bg-[var(--color-border)] rounded-[var(--radius-lg)] animate-pulse" />
        <SkeletonRow count={1} />
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto space-y-5 py-4 flex flex-col items-center">
      <h1 className="text-xl font-bold text-[var(--color-text)]">{t('player.qr_profile')}</h1>

      <div className="bg-white p-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code" className="w-48 h-48" />
        ) : (
          <div className="w-48 h-48 flex items-center justify-center bg-[var(--color-border)] rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)]">
            {t('common.generating')}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <EntityImage src={p.avatar_url || p.avatarUrl} name={p.full_name || p.fullName} className="w-12 h-12 rounded-full" />
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{p.full_name || p.fullName || t('player.player')}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {p.main_sport || p.mainSport || ''}{p.main_sport && p.main_level ? ` · ${p.main_level}` : p.main_level || ''}
          </p>
        </div>
      </div>

      <button
        onClick={handleShare}
        className="w-full px-4 py-2.5 bg-[var(--color-primary)] text-white text-sm font-medium rounded-[var(--radius-md)] hover:opacity-90 transition-opacity"
      >
        {t('player.share_profile')}
      </button>
    </div>
  );
}
