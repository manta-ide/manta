"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.anykey = exports.confirm = exports.prompt = void 0;
const chalk_1 = __importDefault(require("chalk"));
const Errors = __importStar(require("../errors"));
const config_1 = require("./config");
function normal(options, retries = 100) {
    if (retries < 0)
        throw new Error('no input');
    return new Promise((resolve, reject) => {
        let timer;
        if (options.timeout) {
            timer = setTimeout(() => {
                process.stdin.pause();
                reject(new Error('Prompt timeout'));
            }, options.timeout);
            timer.unref();
        }
        process.stdin.setEncoding('utf8');
        process.stderr.write(options.prompt);
        process.stdin.resume();
        process.stdin.once('data', (b) => {
            if (timer)
                clearTimeout(timer);
            process.stdin.pause();
            const data = (typeof b === 'string' ? b : b.toString()).trim();
            if (!options.default && options.required && data === '') {
                resolve(normal(options, retries - 1));
            }
            else {
                resolve(data || options.default);
            }
        });
    });
}
function getPrompt(name, type, defaultValue) {
    let prompt = '> ';
    if (defaultValue && type === 'hide') {
        defaultValue = '*'.repeat(defaultValue.length);
    }
    if (name && defaultValue)
        prompt = name + ' ' + chalk_1.default.yellow('[' + defaultValue + ']') + ': ';
    else if (name)
        prompt = `${name}: `;
    return prompt;
}
async function single(options) {
    const raw = process.stdin.isRaw;
    if (process.stdin.setRawMode)
        process.stdin.setRawMode(true);
    options.required = options.required ?? false;
    const response = await normal(options);
    if (process.stdin.setRawMode)
        process.stdin.setRawMode(Boolean(raw));
    return response;
}
function replacePrompt(prompt) {
    const ansiEscapes = require('ansi-escapes');
    process.stderr.write(ansiEscapes.cursorHide +
        ansiEscapes.cursorUp(1) +
        ansiEscapes.cursorLeft +
        prompt +
        ansiEscapes.cursorDown(1) +
        ansiEscapes.cursorLeft +
        ansiEscapes.cursorShow);
}
async function _prompt(name, inputOptions = {}) {
    const prompt = getPrompt(name, inputOptions.type, inputOptions.default);
    const options = {
        default: '',
        isTTY: Boolean(process.env.TERM !== 'dumb' && process.stdin.isTTY),
        name,
        prompt,
        required: true,
        type: 'normal',
        ...inputOptions,
    };
    const passwordPrompt = require('password-prompt');
    switch (options.type) {
        case 'normal': {
            return normal(options);
        }
        case 'single': {
            return single(options);
        }
        case 'mask': {
            return passwordPrompt(options.prompt, {
                default: options.default,
                method: options.type,
                required: options.required,
            }).then((value) => {
                replacePrompt(getPrompt(name, 'hide', inputOptions.default));
                return value;
            });
        }
        case 'hide': {
            return passwordPrompt(options.prompt, {
                default: options.default,
                method: options.type,
                required: options.required,
            });
        }
        default: {
            throw new Error(`unexpected type ${options.type}`);
        }
    }
}
/**
 * prompt for input
 * @param name - prompt text
 * @param options - @see IPromptOptions
 * @returns Promise<string>
 */
async function prompt(name, options = {}) {
    return config_1.config.action.pauseAsync(() => _prompt(name, options), chalk_1.default.cyan('?'));
}
exports.prompt = prompt;
/**
 * confirmation prompt (yes/no)
 * @param message - confirmation text
 * @returns Promise<boolean>
 */
function confirm(message) {
    return config_1.config.action.pauseAsync(async () => {
        const confirm = async () => {
            const raw = await _prompt(message);
            const response = raw.toLowerCase();
            if (['n', 'no'].includes(response))
                return false;
            if (['y', 'yes'].includes(response))
                return true;
            return confirm();
        };
        return confirm();
    }, chalk_1.default.cyan('?'));
}
exports.confirm = confirm;
/**
 * "press anykey to continue"
 * @param message - optional message to display to user
 * @returns Promise<string>
 */
async function anykey(message) {
    const tty = Boolean(process.stdin.setRawMode);
    if (!message) {
        message = tty
            ? `Press any key to continue or ${chalk_1.default.yellow('q')} to exit`
            : `Press enter to continue or ${chalk_1.default.yellow('q')} to exit`;
    }
    const char = await prompt(message, { required: false, type: 'single' });
    if (tty)
        process.stderr.write('\n');
    if (char === 'q')
        Errors.error('quit');
    if (char === '\u0003')
        Errors.error('ctrl-c');
    return char;
}
exports.anykey = anykey;
