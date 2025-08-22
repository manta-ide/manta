import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import webpack from "webpack";

// Load the CMS-style variables snapshot from .graph/vars.json
function loadGraphVars(): Record<string, string | number | boolean> {
  try {
    const fp = path.resolve(".graph/vars.json");
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return {}; // fallback if file is missing
  }
}

const nextConfig: NextConfig = {
  /* your existing options */
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
    dangerouslyAllowSVG: true,
  },
  basePath: "/iframe",

  // Inject __GRAPH_VARS__ at compile time
  webpack(config) {
    const graphVars = loadGraphVars();
    config.plugins ??= [];
    config.plugins.push(
      new webpack.DefinePlugin({
        __GRAPH_VARS__: JSON.stringify(graphVars),
      })
    );
    return config;
  },
};

export default nextConfig;
