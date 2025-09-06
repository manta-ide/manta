import {Command, Flags} from '@oclif/core';
import path from 'node:path';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import JSZip from 'jszip';

export default class Init extends Command {
  static description = 'Initialize a local project by downloading a template into the current directory';

  static aliases = ['i'];

  static flags = {
    repo: Flags.string({ description: 'GitHub repo in owner/repo format', default: 'makosst/manta-template' }),
    ref: Flags.string({ description: 'Git ref (branch or tag)', default: 'main' }),
    zipUrl: Flags.string({ description: 'Override full ZIP URL (for custom refs/archive)' }),
    token: Flags.string({ description: 'GitHub token (for private repos); defaults to GITHUB_TOKEN env' }),
    force: Flags.boolean({ description: 'Overwrite existing files', default: false }),
    subdir: Flags.string({ description: 'Subdirectory within the repo to extract', default: '' }),
  } as const;

  async run(): Promise<void> {
    const {flags} = await this.parse(Init);
    const cwd = process.cwd();
    const repoSpec = (flags.repo || 'makosst/manta-template').trim();
    const ref = (flags.ref || 'main').trim();
    const token = (flags.token || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '').trim();
    const subdir = (flags.subdir || '').replace(/^\/+|\/+$/g, '');

    const zipUrl = flags.zipUrl?.trim() || `https://codeload.github.com/${repoSpec}/zip/refs/heads/${encodeURIComponent(ref)}`;
    this.log(`[manta] downloading ${repoSpec}@${ref}`);

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(zipUrl, { headers });
    if (!resp.ok) return this.error(`Failed to download ZIP: ${resp.status} ${resp.statusText}`);
    const ab = await resp.arrayBuffer();
    const zip = await JSZip.loadAsync(ab);

    // Detect top-level folder prefix (e.g., repo-ref/)
    let rootPrefix = '';
    zip.forEach((relPath) => {
      const parts = relPath.split('/');
      if (parts.length > 1 && !rootPrefix) rootPrefix = parts[0] + '/';
    });

    const isUnderSubdir = (p: string) => {
      const rel = rootPrefix && p.startsWith(rootPrefix) ? p.slice(rootPrefix.length) : p;
      if (!subdir) return rel && !rel.endsWith('/');
      const norm = rel.replace(/^\/+/, '');
      return norm.startsWith(subdir + '/') && !norm.endsWith('/');
    };
    const toCwdRel = (p: string) => {
      const rel = rootPrefix && p.startsWith(rootPrefix) ? p.slice(rootPrefix.length) : p;
      return subdir ? rel.replace(new RegExp('^' + subdir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '') : rel;
    };

    // Write entries
    const entries = Object.values(zip.files);
    let written = 0;
    for (const entry of entries) {
      if (entry.dir) continue;
      if (!isUnderSubdir(entry.name)) continue;
      const rel = toCwdRel(entry.name);
      if (!rel) continue;
      const abs = path.join(cwd, rel);
      const dir = path.dirname(abs);
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(abs) && !flags.force) {
        this.log(`[skip] ${rel} (exists)`);
        continue;
      }
      const content = await entry.async('nodebuffer');
      fs.writeFileSync(abs, content);
      written++;
    }
    this.log(`[manta] wrote ${written} files to ${cwd}`);

    // Post-install: npm install and build at project root (best-effort)
    await this.runIfExists(cwd, 'npm', ['i']);
    await this.runIfExists(cwd, 'npm', ['run', 'build']);

    // Post-install for child template if present
    const childDir = path.join(cwd, 'vite-base-template');
    if (fs.existsSync(path.join(childDir, 'package.json'))) {
      await this.runIfExists(childDir, 'npm', ['i']);
      await this.runIfExists(childDir, 'npm', ['run', 'build']);
    }
  }

  private async runIfExists(cwd: string, cmd: string, args: string[]) {
    return await new Promise<void>((resolve) => {
      try {
        const ps = spawn(cmd, args, {cwd, stdio: 'inherit', shell: process.platform === 'win32'});
        ps.on('close', () => resolve());
        ps.on('error', () => resolve());
      } catch { resolve(); }
    });
  }
}
