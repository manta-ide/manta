"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const node_util_1 = require("node:util");
function styledObject(obj, keys) {
    const output = [];
    const keyLengths = Object.keys(obj).map((key) => key.toString().length);
    const maxKeyLength = Math.max(...keyLengths) + 2;
    function pp(obj) {
        if (typeof obj === 'string' || typeof obj === 'number')
            return obj;
        if (typeof obj === 'object') {
            return Object.keys(obj)
                .map((k) => k + ': ' + (0, node_util_1.inspect)(obj[k]))
                .join(', ');
        }
        return (0, node_util_1.inspect)(obj);
    }
    const logKeyValue = (key, value) => `${chalk_1.default.blue(key)}:` + ' '.repeat(maxKeyLength - key.length - 1) + pp(value);
    for (const key of keys || Object.keys(obj).sort()) {
        const value = obj[key];
        if (Array.isArray(value)) {
            if (value.length > 0) {
                output.push(logKeyValue(key, value[0]));
                for (const e of value.slice(1)) {
                    output.push(' '.repeat(maxKeyLength) + pp(e));
                }
            }
        }
        else if (value !== null && value !== undefined) {
            output.push(logKeyValue(key, value));
        }
    }
    return output.join('\n');
}
exports.default = styledObject;
