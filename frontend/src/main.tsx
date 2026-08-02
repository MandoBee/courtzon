import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Stale service workers from earlier builds reload the page during Vite dev.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => void r.unregister());
  });
}

// Prevent pinch-to-zoom gestures on iOS Safari (viewport meta alone is ignored
// since iOS 10). touch-action in CSS covers Android/other browsers.
function preventPinchZoom(e: Event): void {
  e.preventDefault();
}
document.addEventListener('gesturestart', preventPinchZoom, { passive: false });
document.addEventListener('gesturechange', preventPinchZoom, { passive: false });
document.addEventListener('gestureend', preventPinchZoom, { passive: false });

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const app = <App />;

createRoot(rootElement).render(
  import.meta.env.DEV ? app : <StrictMode>{app}</StrictMode>,
);
