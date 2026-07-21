import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../examples", import.meta.url)));
const port = Number.parseInt(process.env.PATCHPROOF_DEMO_PORT ?? "4173", 10);

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const requested = decodeURIComponent(
      url.pathname === "/" ? "/patchproof-report.html" : url.pathname,
    );
    const path = resolve(root, `.${requested}`);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const file = await stat(path);
    if (!file.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": contentTypes.get(extname(path).toLowerCase()) ?? "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    createReadStream(path).pipe(response);
  } catch {
    response
      .writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      .end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`PatchProof demo: http://127.0.0.1:${port}\n`);
});
