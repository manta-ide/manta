import { Command, Flags } from '@oclif/core';
import readline from 'node:readline';
import { writeConfig, readConfig } from '../config/store.js';
class Auth extends Command {
    async run() {
        const { flags } = await this.parse(Auth);
        const baseUrl = flags.url.replace(/\/$/, '');
        this.log(`Manta URL: ${baseUrl}`);
        const signinUrl = `${baseUrl}/signin`;
        const tokenUrl = `${baseUrl}/api/mcp/access-token`;
        this.log('1) Sign in to your account:');
        this.log(`   ${signinUrl}`);
        this.log('2) After signing in, open this URL to view your session token:');
        this.log(`   ${tokenUrl}`);
        if (flags.open) {
            try {
                const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
                await new Promise((resolve) => {
                    const child = require('node:child_process').spawn(opener, [signinUrl], { stdio: 'ignore', shell: process.platform === 'win32' });
                    child.on('error', () => resolve());
                    child.on('close', () => resolve());
                });
            }
            catch { }
        }
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q) => new Promise((res) => rl.question(q, (a) => res(a)));
        const token = (await ask('\nPaste session token from /api/mcp/access-token: ')).trim();
        rl.close();
        if (!token) {
            this.error('No token provided.');
            return;
        }
        // Try to derive userId from the backend using Authorization: Bearer <token>
        let userId;
        try {
            const who = await fetch(`${baseUrl}/api/mcp/access-token`, {
                method: 'GET',
                headers: { authorization: `Bearer ${token}` },
            });
            if (who.ok) {
                const data = await who.json();
                if (data?.userId)
                    userId = data.userId;
            }
        }
        catch { }
        writeConfig({ mantaApiUrl: baseUrl, mantaApiKey: token, userId });
        const cfg = readConfig();
        this.log('\nSaved credentials:');
        this.log(`- url: ${cfg.mantaApiUrl}`);
        this.log(`- userId: ${cfg.userId ?? '(unknown)'}`);
        this.log(`- apiKey: ${cfg.mantaApiKey ? 'stored' : 'missing'}`);
        this.log('\nYou can now run the worker: mproxy worker --user ' + (cfg.userId ?? '<your-user-id>'));
    }
}
Auth.description = 'Authenticate CLI with Manta backend and store API key + user id locally';
Auth.flags = {
    url: Flags.string({ description: 'Base URL of the Manta app', default: process.env.MANTA_API_URL || 'http://localhost:3000' }),
    open: Flags.boolean({ description: 'Attempt to open the sign-in page in your browser', default: true }),
};
export default Auth;
//# sourceMappingURL=auth.js.map