import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(os.homedir(), '.mproxy');
const file = path.join(dir, 'config.json');
export function readConfig() {
    try {
        const raw = fs.readFileSync(file, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function writeConfig(update) {
    const cur = readConfig();
    const next = { ...cur, ...update };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
}
//# sourceMappingURL=store.js.map