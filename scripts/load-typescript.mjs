import { readFile } from "node:fs/promises";
import ts from "typescript";
const cache = new Map();
/** Load the same browser-independent TypeScript modules under plain Node. */
export async function moduleUrl(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const task = (async () => {
    let code = ts.transpileModule(await readFile(url, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const imports = [...code.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)];
    for (const [, specifier] of imports) {
      const dependency = new URL(
        specifier.endsWith(".ts") ? specifier : `${specifier}.ts`,
        url,
      );
      code = code
        .replaceAll(
          `"${specifier}"`,
          JSON.stringify(await moduleUrl(dependency)),
        )
        .replaceAll(
          `'${specifier}'`,
          JSON.stringify(await moduleUrl(dependency)),
        );
    }
    return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  })();
  cache.set(key, task);
  return task;
}
export async function loadTypeScript(url) {
  return import(await moduleUrl(url));
}
