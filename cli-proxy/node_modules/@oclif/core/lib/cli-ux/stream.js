"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stderr = exports.stdout = void 0;
/**
 * A wrapper around process.stdout and process.stderr that allows us to mock out the streams for testing.
 */
class Stream {
    channel;
    constructor(channel) {
        this.channel = channel;
    }
    get isTTY() {
        return process[this.channel].isTTY;
    }
    emit(event, ...args) {
        return process[this.channel].emit(event, ...args);
    }
    getWindowSize() {
        return process[this.channel].getWindowSize();
    }
    on(event, listener) {
        process[this.channel].on(event, listener);
        return this;
    }
    once(event, listener) {
        process[this.channel].once(event, listener);
        return this;
    }
    read() {
        return process[this.channel].read();
    }
    write(data) {
        return process[this.channel].write(data);
    }
}
/**
 * @deprecated Use process.stdout directly. This will be removed in the next major version
 */
exports.stdout = new Stream('stdout');
/**
 * @deprecated Use process.stderr directly. This will be removed in the next major version
 */
exports.stderr = new Stream('stderr');
