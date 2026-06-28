import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const PASS = 'TestPass123!';
const DB = 'courtzon_v3';
const ADMIN = 'mniazyy@gmail.com';
const PHONE = '01012637733';
const BASE = 'http://localhost:3000';

// ---- Password hashing (exact match to backend) ----
function toB64url(b) { return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function pwHash(pw) {
  const s = crypto.randomBytes(32), k = crypto.pbkdf2Sync(pw, s, 210000, 64, 'sha512');
  const v=Buffer.alloc(1); v.writeUInt8(2);
  const i=Buffer.alloc(4); i.writeUInt32BE(210000);
  const l=Buffer.alloc(2); l.writeUInt16BE(64);
  return '$pbkdf2-sha512$'+toB64url(Buffer.concat([v,i,l,s,k]));
}

// ---- Minimal PNG ----
function crc32(b) { let c=0xFFFFFFFF; for(let i=0;i<b.length;i++){c^=b[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xEDB88320:0);}return(c^0xFFFFFFFF)>>>0; }
function mkpng(w,h,r,g,ba) {
  const sig=Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  const ih=Buffer.alloc(13); ih.writeUInt32BE(w,0); ih.writeUInt32BE(h,4); ih[8]=8; ih[9]=2;
  const rs=1+w*3; const raw=Buffer.alloc(h*rs);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){const o=y*rs+1+x*3;raw[o]=r;raw[o+1]=g;raw[o+2]=ba;}
  const ck=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tb=Buffer.from(t);const cb=Buffer.alloc(4);cb.writeUInt32BE(crc32(Buffer.concat([tb,d])));return Buffer.concat([l,tb,d,cb]);};
  return Buffer.concat([sig, ck('IHDR',ih), ck('IDAT',zlib.deflateSync(raw)), ck('IEND',Buffer.alloc(0))]);
}

// ------ Exec helpers ------
function mysql(sql) {
  const env = fs.readFileSync(path.join(ROOT,'.env'),'utf-8');
  const mpw = (env.match(/MYSQL_ROOT_PASSWORD=(.+)/m)||[])[1]?.trim()||'courtzon2026';
  return execSync(
    `docker compose exec -T mysql mysql -u root -p"${mpw}" ${DB} -N -B`,
    { cwd: ROOT, encoding:'utf-8', input:sql, timeout:15000 }
  );
}
function exec(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding:'utf-8', shell:'powershell.exe', timeout:15000 });
}

// ------ Step 1: Update admin password ------
console.log('Step 1: Admin password');
const hash = pwHash(PASS);
mysql(`UPDATE users SET password_hash = '${hash}' WHERE email = '${ADMIN}';`);
// Verify
const v = mysql(`SELECT LEFT(password_hash,30) FROM users WHERE email = '${ADMIN}';`);
if (!v.includes('pbkdf2')) { console.error('FAIL: hash corrupt'); process.exit(1); }
console.log('OK');

// ------ Step 2: Login ------
console.log('Step 2: Login');
const lr = await fetch(`${BASE}/auth/login`,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({phoneNumber:PHONE,password:PASS,countryCode:'+20'}),
});
if(!lr.ok){console.error('FAIL',await lr.text());process.exit(1);}
const ck = lr.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
console.log('OK');

// ------ Step 3: Create images ------
console.log('Step 3: Images');
const assets = [
  {n:'site-logo',w:300,h:80,r:0x25,g:0x6b,b:0xeb},
  {n:'site-logo-dark',w:300,h:80,r:0xfa,g:0xcc,b:0x15},
  {n:'favicon',w:128,h:128,r:0xdc,g:0x26,b:0x26},
  {n:'favicon-dark',w:128,h:128,r:0xf9,g:0x73,b:0x16},
  {n:'pwa-192',w:192,h:192,r:0x16,g:0xa3,b:0x4a},
  {n:'pwa-512',w:512,h:512,r:0x7c,g:0x3a,b:0xed},
];
for (const a of assets) {
  fs.writeFileSync(path.join(import.meta.dirname,a.n+'.png'), mkpng(a.w,a.h,a.r,a.g,a.b));
  console.log(`  ${a.n}.png ${a.w}x${a.h}`);
}

// ------ Step 4: Upload ------
console.log('Step 4: Upload');
for (const a of assets) {
  const buf = fs.readFileSync(path.join(import.meta.dirname,a.n+'.png'));
  const fd = new FormData();
  fd.set('file', new Blob([buf],{type:'image/png'}), a.n+'.png');
  const r = await fetch(`${BASE}/admin/app-settings/upload/${a.n}`, {
    method:'POST', headers:{Cookie:ck}, body:fd,
  });
  const t = await r.text();
  let j; try{j=JSON.parse(t)}catch{console.error(`  ${a.n}: ${r.status} ${t.substring(0,100)}`);continue}
  console.log(`  ${a.n}: ${r.status} ${j?.data?.url||'?'}`);
}

// ------ Step 5: Volume files ------
console.log('Step 5: Volume');
for (const d of ['favicon','favicon-dark','site-logo','site-logo-dark','pwa-192','pwa-512']) {
  const out = exec(`docker compose exec -T ls -la "/app/uploads/app_settings/${d}" 2>$null`);
  const cnt = out.split('\n').filter(l=>l.includes('-')&&!l.startsWith('total')).length;
  console.log(`  ${d}: ${cnt} file(s)`);
}

// ------ Step 6: DB refs ------
console.log('Step 6: DB');
console.log(mysql(`SELECT setting_key, value FROM app_settings WHERE setting_key IN ('favicon_url','favicon_dark_url','site_logo_url','site_logo_dark_url','pwa_icon_192','pwa_icon_512');`));

// ------ Step 7: HTTP 200 ------
console.log('Step 7: HTTP 200');
const pub = await fetch(`${BASE}/public/app-settings`).then(r=>r.json());
const s = pub?.data||{};
for (const k of ['favicon_url','favicon_dark_url','site_logo_url','site_logo_dark_url','pwa_icon_192','pwa_icon_512']) {
  const v = s[k];
  if (!v||v==='""'){console.log(`  SKIP ${k}`);continue}
  const r = await fetch(v.startsWith('http')?v:`${BASE}${v}`,{method:'HEAD'});
  console.log(`  ${r.status} ${k}`);
}

// ------ Step 8: Manifest ------
console.log('Step 8: Manifest');
const man = await fetch(`${BASE}/manifest.webmanifest`).then(r=>r.json());
console.log(`  ${(man.icons||[]).length} icons`);
for (const ic of (man.icons||[])) {
  const r = await fetch(new URL(ic.src,BASE).href,{method:'HEAD'});
  console.log(`  ${r.status} ${ic.sizes} -> ${ic.src}`);
}

// ------ Step 9: Storage doc ------
console.log('\n=== STORAGE LOCATION ===');
console.log('  Host: ./backend/uploads/app_settings/{asset_type}/');
console.log('  Container: /app/uploads/app_settings/{asset_type}/');
console.log('  Type: bind mount (docker-compose.yml)');
console.log('  Persistence: bind mounts survive compose down/up, rebuilds, redeploys.');
console.log('  To delete: explicit rm -rf ./backend/uploads/ on the host.');

// ------ Reset password ------
console.log('\nReset password');
mysql(`UPDATE users SET password_hash = '${pwHash('password123')}' WHERE email = '${ADMIN}';`);
console.log('Done.');
