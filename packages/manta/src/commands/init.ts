import {Command, Flags} from '@oclif/core';
import readline from 'node:readline';
import {writeConfig, readConfig} from '../config/store.js';
import {spawn} from 'node:child_process';

export default class Init extends Command {
  static description = 'Initialize Manta CLI: sign in and store API key + user id';

  static flags = {
    url: Flags.string({ description: 'Base URL of the Manta app', default: process.env.MANTA_API_URL || 'http://localhost:3000' }),
    open: Flags.boolean({ description: 'Open sign-in page in your browser', default: true }),
  } as const;

  async run(): Promise<void> {
    const {flags} = await this.parse(Init);
    const baseUrl = flags.url.replace(/\/$/, '');
    this.log(`Manta URL: ${baseUrl}`);
    const signinUrl = `${baseUrl}/signin`;
    const tokenUrl = `${baseUrl}/api/mcp/access-token`;
    this.log('1) Sign in to your account:');
    this.log(`   ${signinUrl}`);
    this.log('2) After signing in, open this URL to get your session token:');
    this.log(`   ${tokenUrl}`);
    if (flags.open) {
      try {
        const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        await new Promise<void>((resolve) => {
          const child = spawn(opener, [signinUrl], {stdio: 'ignore', shell: process.platform === 'win32'});
          child.on('error', () => resolve());
          child.on('close', () => resolve());
        });
      } catch {}
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>((res) => rl.question(q, (a) => res(a)));
    const token = (await ask('\nPaste session token from /api/mcp/access-token: ')).trim();
    rl.close();
    if (!token) return this.error('No token provided.');
    let userId: string | undefined;
    try {
      const who = await fetch(`${baseUrl}/api/mcp/access-token`, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
      if (who.ok) { const data: any = await who.json(); if (data?.userId) userId = data.userId; }
    } catch {}
    writeConfig({ mantaApiUrl: baseUrl, mantaApiKey: token, userId });
    const cfg = readConfig();
    this.log('\nSaved credentials:');
    this.log(`- url: ${cfg.mantaApiUrl}`);
    this.log(`- userId: ${cfg.userId ?? '(unknown)'}`);
    this.log(`- apiKey: ${cfg.mantaApiKey ? 'stored' : 'missing'}`);
    this.log('\nEnsuring manta-mcp is installed...');
    await this.ensureMantaMcpInstalled();
    this.log('\nRun your worker with: manta run');
  }

  private async ensureMantaMcpInstalled(): Promise<void> {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const found = await new Promise<boolean>((resolve) => {
      const ps = spawn(whichCmd, ['manta-mcp']);
      ps.on('close', (code) => resolve(code === 0));
      ps.on('error', () => resolve(false));
    });
    if (found) { this.log('manta-mcp is on PATH'); return; }
    const tryInstall = (cmd: string, args: string[], cwd?: string) => new Promise<boolean>((resolve) => {
      this.log(`Installing manta-mcp: ${cmd} ${args.join(' ')}`);
      const ps = spawn(cmd, args, {stdio: 'inherit', cwd});
      ps.on('close', (code) => resolve(code === 0));
      ps.on('error', () => resolve(false));
    });
    if (await tryInstall('npm', ['i', '-g', 'manta-mcp'])) return;
    this.log('Global install failed, falling back to local install');
    await tryInstall('npm', ['i', 'manta-mcp'], process.cwd());
  }
}

