import { run } from '@oclif/core';
export async function main(argv = process.argv.slice(2)) {
    await run(argv, import.meta.url);
}
export default main;
//# sourceMappingURL=index.js.map