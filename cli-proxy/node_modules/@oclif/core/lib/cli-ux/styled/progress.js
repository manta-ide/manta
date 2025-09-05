"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// 3pp
const cli_progress_1 = require("cli-progress");
function progress(options = {}) {
    return new cli_progress_1.SingleBar({ noTTYOutput: Boolean(process.env.TERM === 'dumb' || !process.stdin.isTTY), ...options });
}
exports.default = progress;
