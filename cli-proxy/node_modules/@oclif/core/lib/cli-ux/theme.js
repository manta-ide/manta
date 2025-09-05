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
exports.getColor = exports.parseTheme = exports.colorize = void 0;
const chalk_1 = __importDefault(require("chalk"));
const Color = __importStar(require("color"));
const theme_1 = require("../interfaces/theme");
function isStandardChalk(color) {
    return theme_1.STANDARD_CHALK.includes(color);
}
/**
 * Add color to text.
 * @param color color to use. Can be hex code (e.g. `#ff0000`), rgb (e.g. `rgb(255, 255, 255)`) or a chalk color (e.g. `red`)
 * @param text string to colorize
 * @returns colorized string
 */
function colorize(color, text) {
    if (isStandardChalk(color))
        return chalk_1.default[color](text);
    return color ? chalk_1.default.hex(color)(text) : text;
}
exports.colorize = colorize;
function parseTheme(theme) {
    return Object.fromEntries(Object.entries(theme)
        .map(([key, value]) => [key, getColor(value)])
        .filter(([_, value]) => value));
}
exports.parseTheme = parseTheme;
function getColor(color) {
    try {
        // eslint-disable-next-line new-cap
        return isStandardChalk(color) ? color : new Color.default(color).hex();
    }
    catch { }
}
exports.getColor = getColor;
