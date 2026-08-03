// Post-build script: injects push + local notification + rich media + deep
// linking handlers into the VitePWA-generated sw.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const swPath = resolve(process.cwd(), 'dist/sw.js');
let sw = readFileSync(swPath, 'utf-8');

if (sw.includes('CourtZon Notif Platform')) {
  console.log('[inject-notif-sw] Handlers already present — skipping');
  process.exit(0);
}

const handlers = `
/* ── CourtZon Notification Platform (injected) ── */

// ── Push (server-initiated, rich media, deep link) ──
self.addEventListener('push',(e)=>{
  if(!e.data)return;
  let p;try{p=e.data.json()}catch{p={title:'CourtZon',body:e.data.text()}}
  const {title,body,icon,badge,image,data,tag,actions,requireInteraction}=p;
  e.waitUntil(self.registration.showNotification(title,{
    body:body||'',
    icon:icon||'/icon-192.png',
    badge:badge||'/favicon-32x32.png',
    image:image||undefined,
    tag:tag||'courtzon-default',
    data:{url:data?.url||data?.routePattern||'/app',timestamp:Date.now()},
    actions:actions||[],
    requireInteraction:!!requireInteraction,
    renotify:false,
    vibrate:[200,100,200],
    timestamp:Date.now()
  }))
});

// ── Notification Click (deep-link to correct screen) ──
self.addEventListener('notificationclick',(e)=>{
  e.notification.close();
  const target=e.notification.data?.url||e.notification.data?.routePattern||'/app';
  // Report action click if interactive
  if(e.action){
    fetch('/api/v1/notifications/track',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({notificationId:e.notification.data?.id,action:e.action})})
      .catch(()=>{});
  }
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:!0})
    .then(c=>{for(const w of c){if(w.url.includes(target)&&'focus'in w)return w.focus()}
      return self.clients.openWindow&&self.clients.openWindow(target)}))
});

// ── Local Notification Scheduling (offline reminders) ──
self.addEventListener('message',(e)=>{
  if(e.data?.type!=='scheduleLocalNotification')return;
  const {title,body,icon,data,tag,delayMs}=e.data;
  setTimeout(()=>{
    self.registration.showNotification(title,{
      body:body||'',
      icon:icon||'/icon-192.png',
      badge:'/favicon-32x32.png',
      tag:tag||'cz-local',
      data:{url:data?.url||'/app',isLocal:true,timestamp:Date.now()},
      requireInteraction:false,
      renotify:false,
      timestamp:Date.now()
    })
  },delayMs||0);
});

// ── Push Subscription Refresh ──
self.addEventListener('pushsubscriptionchange',(e)=>{
  e.waitUntil((self).registration.pushManager.subscribe(e.oldSubscription.options)
    .then(s=>fetch('/api/v1/push/register',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({subscription:s.toJSON()})})))
});
`;
sw += handlers;
writeFileSync(swPath, sw);
console.log('[inject-notif-sw] Notification platform handlers injected');
