/**
 * Load KEY=VALUE pairs from optional .env files (local scripts / fallback).
 * Runtime Docker uses process.env from compose `env_file` — no file required.
 */
import { existsSync, readFileSync } from 'node:fs';

export function loadFileEnv(paths) {
  const merged = {};
  for (const envPath of paths) {
    if (!existsSync(envPath)) continue;
    try {
      const envContent = readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        merged[key] = val;
      }
    } catch {
      /* skip unreadable path */
    }
  }
  return merged;
}

export function envFrom(fileEnv, key, fallback) {
  return process.env[key] ?? fileEnv[key] ?? fallback;
}
