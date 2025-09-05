import {CodexProvider} from './codex.js';
import type {Provider} from './provider.js';

const registry: Record<string, Provider> = {
  codex: new CodexProvider(),
};

export function getProvider(name: string): Provider | undefined {
  return registry[name];
}

export function listProviders(): string[] {
  return Object.keys(registry).sort();
}

