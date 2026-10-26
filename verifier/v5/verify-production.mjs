import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.VERIFY_ORIGIN ?? "http://localhost:3100";
const command = `VERIFY_ORIGIN=${baseUrl} node verifier/v5/verify-production.mjs`;
const logPath = "verifier/runs/v5-production-check.log";
const resultPath = "verifier/runs/v5-production-result.json";
const startedAt = new Date().toISOString();
let browser;

function appendLog(result, exitCode) {
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(result)}\nexit=${exitCode}\n`);
}

function processCwd(pid) {
  if (process.platform === "linux") return fs.realpathSync(`/proc/${pid}/cwd`);
  const output = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  const line = output.split("\n").find((item) => item.startsWith("n/"));
  assert.ok(line, `无法读取生产进程 ${pid} 的工作目录`);
  return fs.realpathSync(line.slice(1));
}

function processCommand(pid) {
  if (process.platform === "linux") return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ");
  return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
}

try {
  const html = fs.readFileSync("dist/public/index.html", "utf8");
  assert.match(html, /<title>全产品计价系统<\/title>/);
  assert.doesNotMatch(html, /衡价|>衡</);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0"\s*\/?>/);
  assert.ok(fs.existsSync("dist/boot.js"), "缺少 dist/boot.js");
  const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  assert.ok(assetPaths.length >= 2, "生产入口应引用脚本和样式资源");
  for (const assetPath of assetPaths) assert.ok(fs.existsSync(`dist/public${assetPath}`), `缺少生产资源 ${assetPath}`);

  const pid = Number(process.env.V5_COLD_PID);
  const coldDirectory = process.env.V5_COLD_DIR;
  assert.ok(Number.isInteger(pid) && pid > 0 && coldDirectory, "必须提供 V5_COLD_PID 和 V5_COLD_DIR 进行隔离冷启动验收");
  process.kill(pid, 0);
  assert.equal(fs.realpathSync(coldDirectory), processCwd(pid), "生产进程不在指定隔离目录");
  assert.equal(fs.existsSync(`${coldDirectory}/node_modules`), false, "隔离冷启动目录不得携带 node_modules");
  assert.ok(fs.existsSync(`${coldDirectory}/dist/boot.js`));
  assert.ok(fs.existsSync(`${coldDirectory}/dist/public/index.html`));
  assert.ok(processCommand(pid).includes("dist/boot.js"), "生产进程入口必须为 dist/boot.js");
  const coldStart = { status: "pass", pid, directory: coldDirectory, nodeModulesAbsent: true, entry: "dist/boot.js" };

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
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => {
    responses.set(response.url(), response.status());
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  const rootResponse = await page.goto(baseUrl, { waitUntil: "networkidle0", timeout: 60000 });
  assert.equal(rootResponse?.status(), 200, "生产首页必须返回200");
  await page.waitForSelector(".login-page");
  await page.waitForFunction(() => document.body.innerText.includes("全产品计价系统") && document.body.innerText.includes("六类岗位，六种工作范围"));
  const bodyText = await page.evaluate(() => document.body.innerText);
  assert.equal(bodyText.includes("衡价"), false);
  for (const assetPath of assetPaths) assert.equal(responses.get(new URL(assetPath, baseUrl).href), 200, `生产资源未成功加载：${assetPath}`);
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
  assert.deepEqual(consoleErrors, [], "浏览器控制台存在错误");
  assert.deepEqual(badResponses, [], "生产页面存在失败响应或404");
  await page.screenshot({ path: "verifier/runs/v5-production-desktop.png", fullPage: true });
  const result = {
    status: "pass",
    rootStatus: 200,
    viewportMeta: "pass",
    coldStart,
    productionEntries: ["dist/boot.js", "dist/public/index.html"],
    assets: assetPaths.map((assetPath) => ({ path: assetPath, status: responses.get(new URL(assetPath, baseUrl).href) })),
    ...performance,
    consoleErrors,
    badResponses,
    notFoundCount: [...responses.values()].filter((status) => status === 404).length,
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  appendLog(result, 0);
  console.log(JSON.stringify(result));
} catch (error) {
  const result = { status: "fail", error: error instanceof Error ? error.stack : String(error) };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  appendLog(result, 1);
  console.error(result);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
