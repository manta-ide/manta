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
const ansi_styles_1 = __importDefault(require("ansi-styles"));
const chalk_1 = __importDefault(require("chalk"));
const strip_ansi_1 = __importDefault(require("strip-ansi"));
const supportsColor = __importStar(require("supports-color"));
const screen_1 = require("../../screen");
const base_1 = require("./base");
const spinners_1 = __importDefault(require("./spinners"));
const ansiEscapes = require('ansi-escapes');
function color(s) {
    if (!supportsColor)
        return s;
    const has256 = supportsColor.stdout ? supportsColor.stdout.has256 : (process.env.TERM || '').includes('256');
    return has256 ? `\u001B[38;5;104m${s}${ansi_styles_1.default.reset.open}` : chalk_1.default.magenta(s);
}
class SpinnerAction extends base_1.ActionBase {
    frameIndex;
    frames;
    spinner;
    type = 'spinner';
    constructor() {
        super();
        this.frames = this.getFrames();
        this.frameIndex = 0;
    }
    _frame() {
        const frame = this.frames[this.frameIndex];
        this.frameIndex = ++this.frameIndex % this.frames.length;
        return color(frame);
    }
    _lines(s) {
        return (0, strip_ansi_1.default)(s).split('\n').map((l) => Math.ceil(l.length / screen_1.errtermwidth)).reduce((c, i) => c + i, 0);
    }
    _pause(icon) {
        if (this.spinner)
            clearInterval(this.spinner);
        this._reset();
        if (icon)
            this._render(` ${icon}`);
        this.output = undefined;
    }
    _render(icon) {
        if (!this.task)
            return;
        this._reset();
        this._flushStdout();
        const frame = icon === 'spinner' ? ` ${this._frame()}` : icon || '';
        const status = this.task.status ? ` ${this.task.status}` : '';
        this.output = `${this.task.action}...${frame}${status}\n`;
        this._write(this.std, this.output);
    }
    _reset() {
        if (!this.output)
            return;
        const lines = this._lines(this.output);
        this._write(this.std, ansiEscapes.cursorLeft + ansiEscapes.cursorUp(lines) + ansiEscapes.eraseDown);
        this.output = undefined;
    }
    _start(opts) {
        if (opts.style)
            this.frames = this.getFrames(opts);
        this._reset();
        if (this.spinner)
            clearInterval(this.spinner);
        this._render();
        this.spinner = setInterval((icon) => this._render.bind(this)(icon), process.platform === 'win32' ? 500 : 100, 'spinner');
        const interval = this.spinner;
        interval.unref();
    }
    _stop(status) {
        if (this.task)
            this.task.status = status;
        if (this.spinner)
            clearInterval(this.spinner);
        this._render();
        this.output = undefined;
    }
    getFrames(opts) {
        if (opts?.style)
            return spinners_1.default[opts.style].frames;
        return spinners_1.default[process.platform === 'win32' ? 'line' : 'dots2'].frames;
    }
}
exports.default = SpinnerAction;
