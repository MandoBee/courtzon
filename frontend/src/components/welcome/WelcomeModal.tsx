import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useToast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import api from '../../services/api';

export default function WelcomeModal() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const { showToast } = useToast();
  const [dismissing, setDismissing] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (user && user.hasSeenWelcome === false) {
      setShow(true);
    }
  }, [user]);

  async function handleDismiss() {
    setDismissing(true);
    try {
      const r = await api.patch('/my/welcome-seen');
      if (r.data?.user) {
        setUser({ ...(user!), hasSeenWelcome: true, ...r.data.user });
      } else {
        setUser({ ...(user!), hasSeenWelcome: true });
      }
    } catch {
      setUser({ ...(user!), hasSeenWelcome: true });
      showToast('Failed to update welcome status', 'error');
    } finally {
      setDismissing(false);
      setShow(false);
    }
  }

  if (!show || !user) return null;

  const isCoach = user.coachStatus === 'approved';

  return (
    <Modal open={show} onClose={() => {}} size="sm">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-bold text-[var(--color-text)]">
          {isCoach ? 'Welcome Coach!' : 'Welcome to CourtZon!'}
        </h2>

        {isCoach ? (
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            Set up your session durations, configure your availability, and manage your club contracts from your Coach Profile.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            Personalize your profile, choose your language, and switch between light and dark themes from Settings. Explore courts, book sessions, and join the community!
          </p>
        )}

        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="px-8 py-2.5 rounded-[var(--radius-md)] text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, var(--color-primary)))',
          }}
        >
          {dismissing ? 'Please wait...' : isCoach ? "Let's Go" : 'Got it'}
        </button>
      </div>
    </Modal>
  );
}
