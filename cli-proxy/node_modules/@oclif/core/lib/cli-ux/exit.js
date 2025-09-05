"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitError = void 0;
class ExitError extends Error {
    code;
    error;
    ux;
    constructor(status, error) {
        const code = 'EEXIT';
        super(error ? error.message : `${code}: ${status}`);
        this.error = error;
        this.ux = { exit: status };
        this.code = code;
    }
}
exports.ExitError = ExitError;
