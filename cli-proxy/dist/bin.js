#!/usr/bin/env node
import main from './index.js';
// Forward raw argv (slice handled by oclif)
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(typeof err?.exitCode === 'number' ? err.exitCode : 1);
});
//# sourceMappingURL=bin.js.map