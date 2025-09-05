import { Command } from '@oclif/core';
import { listProviders } from '../providers/index.js';
class Providers extends Command {
    async run() {
        const providers = listProviders();
        for (const p of providers)
            this.log(p);
    }
}
Providers.description = 'List available providers';
export default Providers;
//# sourceMappingURL=providers.js.map