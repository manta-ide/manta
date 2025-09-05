import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export interface MproxyConfig {
  mantaApiUrl?: string;
  mantaApiKey?: string; // Better Auth session token
  userId?: string;
}

const dir = path.join(os.homedir(), '.mproxy');
const file = path.join(dir, 'config.json');

export function readConfig(): MproxyConfig {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as MproxyConfig;
  } catch {
    return {};
  }
}

export function writeConfig(update: Partial<MproxyConfig>) {
  const cur = readConfig();
  const next: MproxyConfig = {...cur, ...update};
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
}

