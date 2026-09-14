const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = __dirname;
const port = Number(process.env.PORT || 8123);
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

function serveFile(request, response) {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath === "/" ? "index.html" : safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(contents);
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  const server = http.createServer(serveFile);
  await listen(server);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const errors = [];
    const failedRequests = [];
    const responses = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText || ""}`));
    page.on("response", (response) => {
      const url = response.url();
      if (/\/(index\.html|p5\.js|arap-p5\.js|sketch\.js|arap2d_bg\.wasm)$/.test(new URL(url).pathname)) {
        responses.push(`${response.status()} ${url}`);
      }
    });

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    try {
      await page.waitForFunction(
        "typeof ArapP5 !== 'undefined' && window.arapReady === true && window.arapShape && window.arapShape.getMesh() !== null",
        null,
        { timeout: 10000 },
      );
    } catch (error) {
      const state = await page.evaluate(`(() => ({
        hasP5: typeof window.p5 !== "undefined",
        hasArapP5: typeof window.ArapP5 !== "undefined",
        arapReady: window.arapReady,
        hasShape: !!window.arapShape,
        hasMesh: !!(window.arapShape && window.arapShape.getMesh && window.arapShape.getMesh()),
      }))()`);
      console.error(JSON.stringify({ error: error.message, errors, failedRequests, responses, state }, null, 2));
      throw error;
    }

    const before = await page.evaluate("window.arapShape.getBoundary().map((p) => [p.x, p.y])");
    await page.evaluate("window.arapShape.moveControl(0, 330, 40)");
    const after = await page.evaluate("window.arapShape.getBoundary().map((p) => [p.x, p.y])");
    const controls = await page.evaluate("window.arapShape.getControls().map((c) => [c.x, c.y, c.meshIndex])");
    const pins = await page.evaluate("window.arapShape.getPins().map((p) => [p.x, p.y, p.meshIndex])");
    await page.evaluate("window.arapShape.drawDebug()");
    const mesh = await page.evaluate(`(() => {
      const mesh = window.arapShape.getMesh();
      return {
        vertices: mesh.vertices.length,
        triangles: mesh.triangles.length,
        boundary: mesh.boundaryCount,
      };
    })()`);
    const moved = before.some((point, i) => Math.hypot(point[0] - after[i][0], point[1] - after[i][1]) > 0.1);

    console.log(JSON.stringify({ errors, moved, controls, pins, mesh }, null, 2));
    if (errors.length || !moved) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await close(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
