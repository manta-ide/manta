"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const stripAnsi = require("strip-ansi");
const timestamp = () => new Date().toISOString();
let timer;
const wait = (ms) => new Promise((resolve) => {
    if (timer)
        timer.unref();
    timer = setTimeout(() => resolve(null), ms);
});
function chomp(s) {
    if (s.endsWith('\n'))
        return s.replace(/\n$/, '');
    return s;
}
class Logger {
    file;
    buffer = [];
    flushing = Promise.resolve();
    constructor(file) {
        this.file = file;
    }
    async flush(waitForMs = 0) {
        await wait(waitForMs);
        this.flushing = this.flushing.then(async () => {
            if (this.buffer.length === 0)
                return;
            const mylines = this.buffer;
            this.buffer = [];
            await (0, promises_1.mkdir)((0, node_path_1.dirname)(this.file), { recursive: true });
            await (0, promises_1.appendFile)(this.file, mylines.join('\n') + '\n');
        });
        await this.flushing;
    }
    log(msg) {
        msg = stripAnsi(chomp(msg));
        const lines = msg.split('\n').map((l) => `${timestamp()} ${l}`.trimEnd());
        this.buffer.push(...lines);
        this.flush(50).catch(console.error);
    }
}
exports.Logger = Logger;
