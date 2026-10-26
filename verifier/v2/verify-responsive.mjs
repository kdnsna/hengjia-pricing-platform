import puppeteer from "puppeteer-core";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const client = createTRPCClient({ links: [httpBatchLink({ url: "http://localhost:3000/api/trpc", transformer: superjson })] });
const workspace = await client.pricing.workspace.query();
const rule = workspace.rules.find((item) => item.id === "N003");
assert.ok(rule, "缺少已完成全流程的 N003 演练指标");
assert.equal(rule.status, "disabled");
assert.equal(rule.version, 5);
assert.equal(workspace.designs.filter((design) => design.ruleId === "N003" && design.status === "published").length, 2);
assert.equal(workspace.rules.filter((item) => item.status === "active").length, 51);
for (const version of [1, 2]) {
  const batch = workspace.batches.find((item) => item.resultSnapshot?.some?.((entry) => entry.ruleId === "N003" && entry.ruleVersion === version));
  assert.ok(batch, `N003 V${version} 批次快照缺失`);
  const snapshot = batch.resultSnapshot.find((entry) => entry.ruleId === "N003" && entry.ruleVersion === version);
  assert.equal(snapshot.ruleDefinition.id, "N003");
  assert.equal(snapshot.score, version === 1 ? 3200 : 3840);
}
const previous = JSON.parse(fs.readFileSync("verifier/runs/v2-browser-result.json", "utf8"));
assert.equal(previous.ruleId, "N003");
assert.match(previous.error, /1024px 指标台账横向页面溢出/, "前序脚本必须已通过全部业务断言并到达响应式阶段");

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
const errors = [];
const badResponses = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function clickText(text) {
  const clicked = await page.evaluate((text) => {
    const element = [...document.querySelectorAll("button")].find((button) => (button.textContent?.trim() === text || Boolean(button.closest(".design-stepper") && button.querySelector("strong")?.textContent?.trim() === text)) && button.getBoundingClientRect().width > 0);
    if (!element) return false;
    element.click();
    return true;
  }, text);
  assert.equal(clicked, true, `找不到按钮 ${text}`);
  await sleep(400);
}
async function noOverflow(label) {
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.client + 1, `${label} 横向溢出 ${size.scroll}/${size.client}`);
}
async function touchCheck(label) {
  const small = await page.evaluate(() => [...document.querySelectorAll("button")].filter((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44);
  }).map((button) => ({ text: button.textContent?.trim(), aria: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  assert.deepEqual(small, [], `${label} 存在小于44px的按钮`);
}
async function screenshot(name) { await page.screenshot({ path: `verifier/runs/v2-${name}.png`, fullPage: true }); }

try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 60000 });
  await clickText("指标设计");
  await page.waitForFunction(() => document.body.innerText.includes("指标，从定义到发布。"));
  for (const width of [1440, 1024, 768]) {
    await page.setViewport({ width, height: 950, deviceScaleFactor: 1 });
    await sleep(250);
    await noOverflow(`${width}px 指标台账`);
  }
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await sleep(300);
  await noOverflow("375px 指标台账");
  await touchCheck("375px 指标台账");
  await screenshot("designer-mobile");
  await page.click(".menu-trigger");
  await sleep(250);
  await page.waitForFunction(() => document.querySelector(".sidebar")?.classList.contains("is-open"));
  await clickText("指标设计");
  assert.equal(await page.$eval(".sidebar", (element) => element.classList.contains("is-open")), false);

  await clickText("设计新指标");
  await page.waitForFunction(() => document.body.innerText.includes("先把指标说清楚"));
  await noOverflow("375px 基本定义");
  await touchCheck("375px 基本定义");
  await screenshot("editor-mobile-basic");
  await clickText("公式设计");
  await noOverflow("375px 公式设计");
  await touchCheck("375px 公式设计");
  await screenshot("editor-mobile-formula");
  await clickText("测试与发布");
  await noOverflow("375px 测试发布");
  await touchCheck("375px 测试发布");
  await screenshot("editor-mobile-tests");
  await clickText("返回指标台账");
  await noOverflow("返回移动台账");

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "networkidle0" });
  await clickText("计价试算");
  const hasRule = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((item) => item.textContent?.trim().startsWith("计价产品"));
    return [...(label?.querySelector("select")?.options ?? [])].some((option) => option.value === "N003");
  });
  assert.equal(hasRule, false, "停用的 N003 不得出现在正式试算");
  assert.equal(errors.length, 0, errors.join(" | "));
  assert.equal(badResponses.length, 0, badResponses.join(" | "));
  const result = { status: "pass", businessPrecursor: "N003 已完成新建、V1/V2发布、试算批次、版本记录、归档及启停用；前序仅在1024px溢出处停止", ruleId: "N003", activeAnnualRules: 51, viewports: [1440, 1024, 768, 375], mobileTouch: "pass", mobileNavigation: "pass", disabledExcludedFromSimulator: true, consoleErrors: errors, badResponses };
  fs.writeFileSync("verifier/runs/v2-responsive-result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await screenshot("responsive-failure").catch(() => {});
  const result = { status: "fail", error: error instanceof Error ? error.stack : String(error), consoleErrors: errors, badResponses };
  fs.writeFileSync("verifier/runs/v2-responsive-result.json", JSON.stringify(result, null, 2));
  console.error(result);
  process.exitCode = 1;
} finally {
  await browser.close();
}
