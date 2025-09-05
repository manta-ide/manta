import { Args, Command, Flags } from '@oclif/core';
import { getProvider, listProviders } from '../providers/index.js';
class Run extends Command {
    async run() {
        const { argv, args, flags } = await this.parse(Run);
        // argv includes provider and any args prior to "--"; oclif non-strict lets us read raw argv
        const rawArgv = this.argv;
        const doubleDashIndex = rawArgv.indexOf('--');
        const providerArgs = doubleDashIndex >= 0 ? rawArgv.slice(doubleDashIndex + 1) : [];
        // Do not proxy login flows; instruct to login locally
        if (providerArgs.some(a => a.toLowerCase() === 'login')) {
            this.error(`Login is not proxied. Please run the provider login directly (e.g., \`${args.provider} login\`).`);
            return;
        }
        const provider = getProvider(args.provider);
        if (!provider) {
            this.error(`Unknown provider: ${args.provider}. Known providers: ${listProviders().join(', ')}`);
            return;
        }
        const code = await provider.run({
            args: providerArgs,
            cwd: flags.cwd ?? process.cwd(),
            env: process.env,
            interactive: !flags['no-interactive'],
        });
        if (code !== 0)
            this.exit(code);
    }
}
Run.description = 'Run a command via a provider\'s proxied CLI';
Run.examples = [
    '<%= config.bin %> run codex -- --help',
];
Run.flags = {
    'no-interactive': Flags.boolean({
        description: 'Disable interactive stdio passthrough',
        default: false,
    }),
    cwd: Flags.string({
        description: 'Working directory to run the provider in',
    }),
};
Run.args = {
    provider: Args.string({
        description: `Provider name. Known providers: ${listProviders().join(', ')}`,
        required: true,
    }),
};
// capture everything after "--" as provider args
Run.strict = false;
export default Run;
//# sourceMappingURL=run.js.map