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
  // The backend payload carries the deep-link route under data.url / data.route
  // (fallback routePattern for legacy senders). The notification data must keep
  // the route + notificationId so notificationclick can deep-link + track.
  const target = (data&&(data.url||data.route||data.routePattern))||'/app';
  e.waitUntil(self.registration.showNotification(title,{
    body:body||'',
    icon:icon||'/icon-192.png',
    badge:badge||'/favicon-32x32.png',
    image:image||undefined,
    tag:tag||'courtzon-default',
    data:Object.assign({url:target,notificationId:data&&data.notificationId,timestamp:Date.now()},data||{}),
    actions:actions||[],
    requireInteraction:!!requireInteraction,
    renotify:false,
    vibrate:[200,100,200],
    timestamp:Date.now()
  }))
});

// ── Notification Click (deep-link to correct screen, focus existing window) ──
self.addEventListener('notificationclick',(e)=>{
  e.notification.close();
  const target=e.notification.data?.url||e.notification.data?.route||'/app';
  const notificationId=e.notification.data?.notificationId;
  // Mark read server-side on body click; report the action when a button is used.
  if(notificationId){
    fetch('/notifications/track',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({eventType:e.action?'clicked':'read',notificationId,actionKey:e.action||undefined})})
      .catch(()=>{});
  }
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:!0})
    .then((windows)=>{
      // Prefer focusing an existing app window and driving it to the target.
      for(const w of windows){
        if('focus'in w){
          w.focus();
          if(typeof w.navigate==='function'&&!w.url.includes(target)){w.navigate(target).catch(()=>{})}
          return Promise.resolve();
        }
      }
      return self.clients.openWindow&&self.clients.openWindow(target);
    }))
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
  const sub=e.oldSubscription;
  const payload=sub&&sub.options?{applicationServerKey:sub.options.applicationServerKey}:undefined;
  e.waitUntil(self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:payload&&payload.applicationServerKey})
    .then((s)=>{
      const j=s.toJSON();
      const fingerprint=self.registration.scope+'web-push';
      return fetch('/notifications/devices',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({deviceFingerprint:fingerprint,platform:'web',deviceType:'web',pushToken:JSON.stringify({endpoint:j.endpoint,keys:j.keys})})});
    }).catch(()=>{}));
});
`;
sw += handlers;
writeFileSync(swPath, sw);
console.log('[inject-notif-sw] Notification platform handlers injected');