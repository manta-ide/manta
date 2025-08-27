"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = require("fs");
var path_1 = require("path");
var core_1 = require("@blaxel/core");
var sandbox = await core_1.SandboxInstance.get("vite-test1");
function collect(dir, base) {
    if (base === void 0) { base = dir; }
    var out = [];
    for (var _i = 0, _a = fs_1.default.readdirSync(dir); _i < _a.length; _i++) {
        var name_1 = _a[_i];
        var full = path_1.default.join(dir, name_1);
        var stat = fs_1.default.statSync(full);
        if (stat.isDirectory())
            out.push.apply(out, collect(full, base));
        else
            out.push({ path: path_1.default.relative(base, full), content: fs_1.default.readFileSync(full, "utf8") });
    }
    return out;
}
var files = __spreadArray(__spreadArray(__spreadArray([], collect("./src").map(function (f) { return (__assign(__assign({}, f), { path: path_1.default.join("src", f.path) })); }), true), collect("./_graph").map(function (f) { return (__assign(__assign({}, f), { path: path_1.default.join("_graph", f.path) })); }), true), [
    // add root config files
    { path: "package.json", content: fs_1.default.readFileSync("package.json", "utf8") },
    { path: "package-lock.json", content: fs_1.default.readFileSync("package-lock.json", "utf8") }, // if exists
    { path: "tsconfig.json", content: fs_1.default.readFileSync("tsconfig.json", "utf8") }, // if exists
    { path: "vite.config.ts", content: fs_1.default.readFileSync("vite.config.ts", "utf8") }, // if exists
    { path: "postcss.config.mjs", content: fs_1.default.readFileSync("postcss.config.mjs", "utf8") }, // if exists
    { path: "eslint.config.mjs", content: fs_1.default.readFileSync("eslint.config.mjs", "utf8") }, // if exists
    { path: "tsconfig.node.json", content: fs_1.default.readFileSync("tsconfig.node.json", "utf8") }, // if exists
], false);
await sandbox.fs.writeTree(files, "/blaxel/app");
console.log("✅ Synced to sandbox");
