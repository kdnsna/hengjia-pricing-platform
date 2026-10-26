import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const command = "node verifier/v2/verify-production.mjs";
const logPath = "verifier/runs/v2-production-check.log";
const resultPath = "verifier/runs/v2-production-result.json";
const startedAt = new Date().toISOString();
let browser;

function appendLog(result, exitCode) {
  fs.appendFileSync(
    logPath,
    `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(result)}\nexit=${exitCode}\n`,
  );
}

try {
  const html = fs.readFileSync("dist/public/index.html", "utf8");
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0"\s*\/?>/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/i);
  assert.ok(fs.existsSync("dist/boot.js"), "缺少 dist/boot.js");

  const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(assetPaths.length >= 2, "生产入口应引用脚本和样式资源");
  for (const path of assetPaths) {
    assert.ok(fs.existsSync(`dist/public${path}`), `缺少生产资源 ${path}`);
  }

  let coldStart = { status: "not_checked" };
  const pidMarker = "/tmp/hengjia-v2-production.pid";
  const directoryMarker = "/tmp/hengjia-v2-cold-dir";
  if (fs.existsSync(pidMarker) && fs.existsSync(directoryMarker)) {
    const pid = Number(fs.readFileSync(pidMarker, "utf8").trim());
    const coldDirectory = fs.readFileSync(directoryMarker, "utf8").trim();
    process.kill(pid, 0);
    assert.equal(fs.realpathSync(`/proc/${pid}/cwd`), coldDirectory, "生产进程不在隔离冷启动目录");
    assert.equal(fs.existsSync(`${coldDirectory}/node_modules`), false, "隔离冷启动目录不得携带 node_modules");
    assert.ok(fs.existsSync(`${coldDirectory}/dist/boot.js`));
    assert.ok(fs.existsSync(`${coldDirectory}/dist/public/index.html`));
    const commandLine = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    assert.ok(commandLine.includes("dist/boot.js"), "生产进程入口必须为 dist/boot.js");
    coldStart = { status: "pass", pid, nodeModulesAbsent: true, entry: "dist/boot.js" };
  }

  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  const consoleErrors = [];
  const badResponses = [];
  const responses = new Map();
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    responses.set(response.url(), response.status());
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  const rootResponse = await page.goto("http://localhost:3000", {
    waitUntil: "networkidle0",
    timeout: 60000,
  });
  assert.equal(rootResponse?.status(), 200, "生产首页必须返回200");
  await page.waitForFunction(() => document.body.innerText.includes("全产品计价系统"));
  await page.waitForFunction(() => document.body.innerText.includes("按岗位进入计价工作台") && document.body.innerText.includes("六类岗位，六种工作范围"));
  for (const path of assetPaths) {
    const url = new URL(path, "http://localhost:3000").href;
    assert.equal(responses.get(url), 200, `生产资源未成功加载：${path}`);
  }

  const performance = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const entries = navigation ? [navigation, ...resources] : [...resources];
    const sum = (key) => entries.reduce((total, entry) => total + (Number(entry[key]) || 0), 0);
    return {
      requestCount: entries.length,
      staticAssetCount: resources.filter((entry) => new URL(entry.name).pathname.startsWith("/assets/")).length,
      transferBytes: sum("transferSize"),
      encodedBodyBytes: sum("encodedBodySize"),
      decodedBodyBytes: sum("decodedBodySize"),
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
    };
  });
  assert.ok(performance.requestCount >= 3, "生产请求计数异常");
  assert.ok(performance.staticAssetCount >= 2, "生产静态资源计数异常");
  assert.ok(performance.encodedBodyBytes > 0, "页面重量必须大于0");
  assert.deepEqual(consoleErrors, [], "浏览器控制台存在错误");
  assert.deepEqual(badResponses, [], "生产页面存在失败响应或404");

  await page.screenshot({ path: "verifier/runs/v2-production-desktop.png", fullPage: true });
  const result = {
    status: "pass",
    rootStatus: 200,
    viewportMeta: "pass",
    coldStart,
    productionEntries: ["dist/boot.js", "dist/public/index.html"],
    assets: assetPaths.map((path) => ({ path, status: responses.get(new URL(path, "http://localhost:3000").href) })),
    ...performance,
    consoleErrors,
    badResponses,
    notFoundCount: [...responses.values()].filter((status) => status === 404).length,
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  appendLog(result, 0);
  console.log(JSON.stringify(result));
} catch (error) {
  const result = {
    status: "fail",
    error: error instanceof Error ? error.stack : String(error),
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  appendLog(result, 1);
  console.error(result);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
