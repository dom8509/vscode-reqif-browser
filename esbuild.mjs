import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const builds = [
  {
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    platform: "node",
    format: "cjs",
    external: ["vscode"],
  },
  {
    entryPoints: ["webview/main.ts"],
    outfile: "dist/webview.js",
    platform: "browser",
    format: "iife",
  },
];

for (const options of builds) {
  const ctx = await esbuild.context({
    ...options,
    bundle: true,
    sourcemap: true,
    target: "es2022",
    logLevel: "info",
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}
