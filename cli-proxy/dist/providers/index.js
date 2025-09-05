import { CodexProvider } from './codex.js';
const registry = {
    codex: new CodexProvider(),
};
export function getProvider(name) {
    return registry[name];
}
export function listProviders() {
    return Object.keys(registry).sort();
}
//# sourceMappingURL=index.js.map