import { useEffect, useState } from 'react';
import SiteLogo from './branding/SiteLogo';

const LOGO_DURATION = 600;
const TOTAL_DURATION = 1400;
const FADE_DURATION = 300;

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {
  const [phase, setPhase] = useState<'logo' | 'tagline' | 'fade' | 'done'>('logo');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('tagline'), LOGO_DURATION);
    const t2 = setTimeout(() => setPhase('fade'), TOTAL_DURATION);
    const t3 = setTimeout(() => {
      setPhase('done');
      onFinish();
    }, TOTAL_DURATION + FADE_DURATION);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onFinish]);

  if (phase === 'done') return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0A0A0F] transition-opacity duration-300 ${phase === 'fade' ? 'opacity-0' : 'opacity-100'}`}
    >
      <div
        className={`transition-all duration-700 ease-out ${phase === 'logo' ? 'opacity-0 scale-[0.85]' : 'opacity-100 scale-100'}`}
        style={{ filter: phase === 'tagline' ? 'drop-shadow(0 0 20px rgba(5, 150, 105, 0.3))' : 'none' }}
      >
        <SiteLogo size="lg" variant="primary" />
      </div>

      <div
        className={`mt-4 transition-all duration-500 ease-out ${phase === 'tagline' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      >
        <p className="text-[var(--color-text-muted)] text-lg tracking-wider font-light">
          Book.<span className="text-[var(--color-primary)]">Play.</span>Repeat.
        </p>
      </div>

      <div className="absolute bottom-12 flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-[var(--color-primary)]/60"
            style={{ animation: `splash-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>

      <style>{`
        @keyframes splash-dot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
