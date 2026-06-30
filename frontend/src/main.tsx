import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

console.log("==================================================");
console.log("CourtZon Marketplace Debug Build");
console.log("Commit:", __COMMIT_SHA__);
console.log("Build Time:", __BUILD_TIME__);
console.log("Mode:", import.meta.env.MODE);
console.log("==================================================");

// Stale service workers from earlier builds reload the page during Vite dev.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => void r.unregister());
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

const app = <App />;

createRoot(rootElement).render(
  import.meta.env.DEV ? app : <StrictMode>{app}</StrictMode>,
);
