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
exports.toStandardizedId = exports.toConfiguredId = exports.settings = exports.Performance = exports.Parser = exports.ModuleLoader = exports.run = exports.Interfaces = exports.loadHelpClass = exports.HelpBase = exports.Help = exports.CommandHelp = exports.Flags = exports.execute = exports.handle = exports.Errors = exports.Plugin = exports.Config = exports.Command = exports.stdout = exports.stderr = exports.flush = exports.ux = exports.Args = void 0;
const write_1 = __importDefault(require("./cli-ux/write"));
function checkCWD() {
    try {
        process.cwd();
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            write_1.default.stderr('WARNING: current directory does not exist\n');
        }
    }
}
checkCWD();
exports.Args = __importStar(require("./args"));
exports.ux = __importStar(require("./cli-ux"));
var flush_1 = require("./cli-ux/flush");
Object.defineProperty(exports, "flush", { enumerable: true, get: function () { return flush_1.flush; } });
var stream_1 = require("./cli-ux/stream"); // Remove these in the next major version
Object.defineProperty(exports, "stderr", { enumerable: true, get: function () { return stream_1.stderr; } });
Object.defineProperty(exports, "stdout", { enumerable: true, get: function () { return stream_1.stdout; } });
var command_1 = require("./command");
Object.defineProperty(exports, "Command", { enumerable: true, get: function () { return command_1.Command; } });
var config_1 = require("./config");
Object.defineProperty(exports, "Config", { enumerable: true, get: function () { return config_1.Config; } });
Object.defineProperty(exports, "Plugin", { enumerable: true, get: function () { return config_1.Plugin; } });
exports.Errors = __importStar(require("./errors"));
var handle_1 = require("./errors/handle");
Object.defineProperty(exports, "handle", { enumerable: true, get: function () { return handle_1.handle; } });
var execute_1 = require("./execute");
Object.defineProperty(exports, "execute", { enumerable: true, get: function () { return execute_1.execute; } });
exports.Flags = __importStar(require("./flags"));
var help_1 = require("./help");
Object.defineProperty(exports, "CommandHelp", { enumerable: true, get: function () { return help_1.CommandHelp; } });
Object.defineProperty(exports, "Help", { enumerable: true, get: function () { return help_1.Help; } });
Object.defineProperty(exports, "HelpBase", { enumerable: true, get: function () { return help_1.HelpBase; } });
Object.defineProperty(exports, "loadHelpClass", { enumerable: true, get: function () { return help_1.loadHelpClass; } });
exports.Interfaces = __importStar(require("./interfaces"));
var main_1 = require("./main");
Object.defineProperty(exports, "run", { enumerable: true, get: function () { return main_1.run; } });
exports.ModuleLoader = __importStar(require("./module-loader"));
exports.Parser = __importStar(require("./parser"));
var performance_1 = require("./performance");
Object.defineProperty(exports, "Performance", { enumerable: true, get: function () { return performance_1.Performance; } });
var settings_1 = require("./settings");
Object.defineProperty(exports, "settings", { enumerable: true, get: function () { return settings_1.settings; } });
var ids_1 = require("./util/ids");
Object.defineProperty(exports, "toConfiguredId", { enumerable: true, get: function () { return ids_1.toConfiguredId; } });
Object.defineProperty(exports, "toStandardizedId", { enumerable: true, get: function () { return ids_1.toStandardizedId; } });
