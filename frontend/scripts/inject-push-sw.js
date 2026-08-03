// Post-build script: injects push notification handlers into the
// VitePWA-generated service worker without touching the PWA plugin config.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const swPath = resolve(process.cwd(), 'dist/sw.js');
let sw = readFileSync(swPath, 'utf-8');

if (sw.includes('pushEventListener')) {
  console.log('[inject-push-sw] Push handlers already present — skipping');
  process.exit(0);
}

const pushHandlers = `
/* ── CourtZon Push: injected at build time ── */

self.addEventListener('push',(e)=>{if(!e.data)return;let p;try{p=e.data.json()}catch{p={title:'CourtZon',body:e.data.text()}}const{t,title,body,icon,badge,data,tag,actions}=Object.assign({t:60*1000},p);e.waitUntil(self.registration.showNotification(title,{body:body||'',icon:icon||'/icon-192.png',badge:badge||'/favicon-32x32.png',tag:tag||'courtzon-default',data:{url:data?.url||data?.routePattern||'/app',timestamp:Date.now()},actions:actions||[],renotify:false,timestamp:Date.now()}))});

self.addEventListener('notificationclick',(e)=>{e.notification.close();const u=e.notification.data?.url||e.notification.data?.routePattern||'/app';e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:!0}).then(c=>{for(const w of c){if(w.url.includes(u)&&'focus'in w)return w.focus()}return self.clients.openWindow&&self.clients.openWindow(u)}))});
`;
sw += pushHandlers;
writeFileSync(swPath, sw);
console.log('[inject-push-sw] Push notification handlers injected into sw.js');
