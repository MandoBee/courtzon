import { useState, useEffect, useRef } from 'react';

interface PaymobPixelCardProps {
  clientSecret: string;
  containerId?: string;
  showCancelButton?: boolean;
  onComplete: () => void;
  onCancel?: () => void;
  beforePaymentComplete?: () => Promise<boolean>;
}

export default function PaymobPixelCard({
  clientSecret,
  containerId = 'pixel-container',
  showCancelButton = true,
  onComplete,
  onCancel,
  beforePaymentComplete,
}: PaymobPixelCardProps) {
  const [isFormValid, setIsFormValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const onCancelRef = useRef(onCancel);
  const beforePaymentCompleteRef = useRef(beforePaymentComplete);
  onCompleteRef.current = onComplete;
  onCancelRef.current = onCancel;
  beforePaymentCompleteRef.current = beforePaymentComplete;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const link1 = document.createElement('link');
    link1.rel = 'stylesheet';
    link1.href = 'https://cdn.jsdelivr.net/npm/paymob-pixel@latest/styles.css';
    document.head.appendChild(link1);
    const link2 = document.createElement('link');
    link2.rel = 'stylesheet';
    link2.href = 'https://cdn.jsdelivr.net/npm/paymob-pixel@latest/main.css';
    document.head.appendChild(link2);

    window.addEventListener('payFromOutside', () => {});

    const startPixel = () => {
      const Pixel = (window as any).Pixel;
      if (!Pixel || !containerRef.current) return;
      try {
        new Pixel({
          publicKey: import.meta.env.VITE_PAYMOB_PUBLIC_KEY,
          clientSecret,
          paymentMethods: ['card'],
          elementId: containerId,
          hideCardHolderName: true,
          disablePay: true,
          cardValidationChanged: (isValid: boolean) => setIsFormValid(isValid),
          beforePaymentComplete: async () => {
            const fn = beforePaymentCompleteRef.current;
            if (fn) return fn();
            return true;
          },
          afterPaymentComplete: async () => onCompleteRef.current(),
          onPaymentCancel: async () => onCancelRef.current?.(),
        });
      } catch (e) {
        console.error('[PaymobPixel] init error:', e);
      }
    };

    if ((window as any).Pixel) {
      startPixel();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/paymob-pixel@latest/main.js';
      script.type = 'module';
      script.onload = startPixel;
      script.onerror = () => console.error('[PaymobPixel] script load failed');
      document.body.appendChild(script);
    }

    return () => {
      if (link1.parentNode) link1.parentNode.removeChild(link1);
      if (link2.parentNode) link2.parentNode.removeChild(link2);
    };
  }, [clientSecret, containerId]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={containerRef} id={containerId} className="flex-1 min-h-[300px] overflow-y-auto" />
      <div className="flex gap-3 mt-4 pt-3 border-t border-[var(--color-border)] shrink-0">
        {showCancelButton && (
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-[var(--color-border)] text-[var(--color-text)] text-sm rounded-[var(--radius-md)] font-medium hover:bg-[var(--color-bg)] transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => { setIsProcessing(true); window.dispatchEvent(new Event('payFromOutside')); }}
          disabled={!isFormValid || isProcessing}
          className={`${showCancelButton ? 'flex-1' : 'w-full'} py-2.5 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity`}
        >
          {isProcessing ? 'Processing...' : 'Pay'}
        </button>
      </div>
    </div>
  );
}
