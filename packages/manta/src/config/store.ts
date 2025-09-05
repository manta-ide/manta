import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export interface MantaConfig {
  mantaApiUrl?: string;
  mantaApiKey?: string;
  userId?: string;
}

const dir = path.join(os.homedir(), '.manta');
const file = path.join(dir, 'config.json');

export function readConfig(): MantaConfig {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw) as MantaConfig;
  } catch {
    return {};
  }
}

export function writeConfig(update: Partial<MantaConfig>) {
  const cur = readConfig();
  const next: MantaConfig = {...cur, ...update};
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
}

