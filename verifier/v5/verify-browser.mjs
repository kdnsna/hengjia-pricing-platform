import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import puppeteer from "puppeteer-core";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { DEMO_ACCOUNT_PASSWORD } from "../../contracts/access.ts";
import { getDb } from "../../api/queries/connection.ts";
import { pricingRules } from "../../db/schema.ts";

const baseUrl = process.env.VERIFY_ORIGIN ?? "http://localhost:3000";
const command = `VERIFY_ORIGIN=${baseUrl} node_modules/.bin/tsx verifier/v5/verify-browser.mjs`;
const logPath = "verifier/runs/v5-browser.log";
const resultPath = "verifier/runs/v5-browser-result.json";
const startedAt = new Date().toISOString();
const runId = Date.now().toString(36);
const ruleId = `V5B${runId.toUpperCase()}`;
const period = "2026-12";
const reviewTitle = `V5页面退回批次 ${runId}`;
const lockedTitle = `V5页面锁定批次 ${runId}`;
const otherPeriodTitle = `V5其他期间批次 ${runId}`;
const downloadPath = path.resolve(`verifier/runs/v5-downloads-${runId}`);
const checks = [];
const screenshots = [];
const responsive = [];
const consoleErrors = [];
const badResponses = [];
const sessions = [];
const readback = {};
let browser;
let page;
let loggedIn = false;
let exitCode = 0;
let failure = null;
let result = { status: "running", checks };
const cleanupErrors = [];

function makeClient(cookie = "") {
  return createTRPCClient({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })],
  });
}

async function apiLogin(username) {
  let setCookie = "";
  const client = createTRPCClient({
    links: [httpBatchLink({
      url: `${baseUrl}/api/trpc`,
      transformer: superjson,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        setCookie = response.headers.get("set-cookie") ?? "";
        return response;
      },
    })],
  });
  const user = await client.auth.login.mutate({ username, password: DEMO_ACCOUNT_PASSWORD });
  const session = { client: makeClient(setCookie.split(";")[0]), user };
  sessions.push(session);
  return session;
}

function pass(label) {
  checks.push(label);
  console.log(`PASS ${label}`);
}

function finish(value, code) {
  fs.writeFileSync(resultPath, JSON.stringify(value, null, 2));
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(value)}\nexit=${code}\n`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitText(text) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), { timeout: 25000 }, text);
}
async function waitHeading(text) {
  await page.waitForFunction((value) => [...document.querySelectorAll("h1, h2")].some((item) => item.textContent?.includes(value)), { timeout: 25000 }, text);
}
async function shot(name, fullPage = true) {
  const file = `verifier/runs/v5-${runId}-${name}.png`;
  await page.screenshot({ path: file, fullPage });
  screenshots.push(file);
}
async function clickButton(text, exact = true) {
  const clicked = await page.evaluate((value, exactMatch) => {
    const button = [...document.querySelectorAll("button")].find((item) => {
      const label = item.textContent?.trim();
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (exactMatch ? label === value : label?.includes(value));
    });
    if (!button) return false;
    button.click();
    return true;
  }, text, exact);
  assert.equal(clicked, true, `找不到可点击按钮 ${text}`);
  await sleep(220);
}
async function clickBatchButton(title, buttonText) {
  const clicked = await page.evaluate((batchTitle, label) => {
    const card = [...document.querySelectorAll(".batch-card")].find((item) => item.querySelector("h2")?.textContent?.includes(batchTitle));
    const button = card ? [...card.querySelectorAll("button")].find((item) => item.textContent?.trim() === label) : null;
    if (!button) return false;
    button.click();
    return true;
  }, title, buttonText);
  assert.equal(clicked, true, `找不到批次 ${title} 的 ${buttonText} 按钮`);
  await sleep(250);
}
async function clickShareButton(name, buttonText) {
  const clicked = await page.evaluate((employeeName, label) => {
    const row = [...document.querySelectorAll(".share-row")].find((item) => item.textContent?.includes(employeeName));
    const button = row ? [...row.querySelectorAll("button")].find((item) => item.textContent?.trim() === label) : null;
    if (!button) return false;
    button.click();
    return true;
  }, name, buttonText);
  assert.equal(clicked, true, `找不到 ${name} 的 ${buttonText} 按钮`);
  await sleep(220);
}
async function clickNav(label) {
  const viewport = page.viewport();
  if (viewport.width <= 900) {
    const open = await page.$eval(".sidebar", (item) => item.classList.contains("is-open"));
    if (!open) {
      await page.click(".menu-trigger");
      await page.waitForFunction(() => document.querySelector(".sidebar")?.classList.contains("is-open"));
    }
  }
  const clicked = await page.evaluate((value) => {
    const button = [...document.querySelectorAll(".main-nav button")].find((item) => item.querySelector("span")?.textContent?.trim() === value);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, `找不到导航 ${label}`);
  await sleep(300);
}
async function selectPeriod(value) {
  await page.select(".period-select select", value);
  await sleep(350);
}
async function login(username, expectedName) {
  const chosen = await page.evaluate((value) => {
    const button = [...document.querySelectorAll(".account-choice-list > button")].find((item) => item.textContent?.includes(value));
    if (!button) return false;
    button.click();
    return true;
  }, username);
  assert.equal(chosen, true, `登录页缺少演示账号 ${username}`);
  await page.waitForFunction(() => document.querySelector('input[type="password"]')?.value.length > 0);
  await page.click(".login-submit");
  await page.waitForSelector(".app-shell", { timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes("正在读取工作数据"), { timeout: 30000 });
  await waitText(expectedName);
  loggedIn = true;
  await sleep(200);
}
async function logout() {
  if (page.viewport().width <= 900) {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await sleep(250);
  }
  await page.waitForSelector(".logout-button", { visible: true });
  await page.click(".logout-button");
  await page.waitForSelector(".login-page", { timeout: 30000 });
  loggedIn = false;
  await sleep(150);
}
async function closeModal() {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal-layer", { hidden: true, timeout: 10000 });
  await sleep(120);
}
async function noOverflow(width, label) {
  const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert.ok(size.scroll <= size.client + 1, `${width}px ${label} 横向溢出 ${size.scroll}/${size.client}`);
  responsive.push({ width, view: label, ...size, touch: width === 375 ? "pending" : "not_applicable" });
}
async function touchCheck(label) {
  const small = await page.evaluate(() => [...document.querySelectorAll("button")].filter((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && (rect.width < 44 || rect.height < 44);
  }).map((button) => ({ text: button.textContent?.trim(), aria: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  assert.deepEqual(small, [], `${label} 存在小于44px的可见按钮：${JSON.stringify(small)}`);
  const item = [...responsive].reverse().find((entry) => entry.width === 375 && entry.view === label && entry.touch === "pending");
  if (item) item.touch = "pass";
}
async function expectButtonsAbsent(labels) {
  const present = await page.$$eval("button", (items) => items.filter((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }).map((item) => item.textContent?.trim()));
  for (const label of labels) assert.equal(present.includes(label), false, `当前页面不应出现按钮 ${label}`);
}

try {
  fs.mkdirSync(downloadPath, { recursive: true });
  const db = getDb();
  await db.insert(pricingRules).values({
    id: ruleId,
    name: "V5页面办理闭环指标",
    category: "客户",
    groupName: "V5页面验收",
    unit: "元/户",
    stockRate: null,
    positiveRate: 25,
    negativeRate: 15,
    method: "direct",
    status: "active",
    version: 1,
  });
  const [admin, branch, reviewer, employee, manager] = await Promise.all([
    apiLogin("admin"), apiLogin("branch"), apiLogin("reviewer"), apiLogin("employee"), apiLogin("manager"),
  ]);
  await branch.client.pricing.workspace.query();
  const input = { month: 12, directValue: 128, opening: 8600, current: 9320, previous: 9150, cap: null, floor: null };
  const saveBatch = async (title, batchPeriod) => branch.client.pricing.saveBatch.mutate({
    period: batchPeriod,
    title,
    totalScore: 3200,
    employeeCount: 1,
    snapshot: [{ employee: manager.user.name, employeeId: manager.user.employeeId, ruleId, ruleName: "V5页面办理闭环指标", ruleVersion: 1, ruleDefinition: null, input, score: 3200, expression: "浏览器占位表达式" }],
  });
  const reviewBatch = await saveBatch(reviewTitle, period);
  await branch.client.pricing.submitBatch.mutate({ id: reviewBatch.id });
  const lockedBatch = await saveBatch(lockedTitle, period);
  await branch.client.pricing.submitBatch.mutate({ id: lockedBatch.id });
  await reviewer.client.pricing.approveBatch.mutate({ id: lockedBatch.id });
  const otherPeriodBatch = await saveBatch(otherPeriodTitle, "2026-10");
  await manager.client.pricing.createAllocation.mutate({ ruleId, period, employeeId: manager.user.employeeId, employeeName: manager.user.name, branch: manager.user.branch, ratio: 60, reason: "V5页面验收：客户经理本人参与" });
  await manager.client.pricing.createAllocation.mutate({ ruleId, period, employeeId: employee.user.employeeId, employeeName: employee.user.name, branch: employee.user.branch, ratio: 40, reason: `V5页面验收：协同人员本人确认 ${runId}` });
  const workspace = await admin.client.pricing.workspace.query();
  const periodBatches = workspace.batches.filter((batch) => batch.period === period);
  const lockedTotal = periodBatches.filter((batch) => batch.status === "locked").reduce((sum, batch) => sum + batch.totalScore, 0);
  const allTotal = periodBatches.reduce((sum, batch) => sum + batch.totalScore, 0);
  assert.ok(allTotal > lockedTotal, "验收期间必须同时存在锁定与未锁定批次");
  readback.fixture = { ruleId, reviewBatchId: reviewBatch.id, lockedBatchId: lockedBatch.id, otherPeriodBatchId: otherPeriodBatch.id, lockedTotal, allTotal };
  pass("独立页面数据已准备：复核、锁定、其他期间批次及两条待确认分润");

  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  });
  page = await browser.newPage();
  page.setDefaultTimeout(25000);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push({ type: "console", text: message.text() }); });
  page.on("pageerror", (error) => consoleErrors.push({ type: "pageerror", text: error.message }));
  page.on("response", (response) => { if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() }); });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-page");
  assert.equal(await page.title(), "全产品计价系统");
  const loginText = await page.evaluate(() => document.body.innerText);
  assert.ok(loginText.includes("全产品计价系统"));
  assert.equal(loginText.includes("衡价"), false);
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await noOverflow(375, "登录页");
  await touchCheck("登录页");
  await shot("login-375");
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await shot("login-1440");
  pass("登录页和浏览器标题使用新名称，无旧品牌，桌面与移动布局正常");

  await login("admin", "张海峰");
  await selectPeriod(period);
  await waitText("本期已锁定积分");
  const ledgerScore = await page.$eval(".ledger-main strong", (item) => item.textContent ?? "");
  assert.ok(ledgerScore.includes(lockedTotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })), `工作台锁定积分口径不符：${ledgerScore} / ${lockedTotal}`);
  await clickNav("批次管理");
  await waitHeading("批次复核与记录");
  const initialCards = await page.$$eval(".batch-card h2", (items) => items.map((item) => item.textContent));
  assert.equal(initialCards.includes(otherPeriodTitle), false, "批次列表混入其他期间记录");
  await selectPeriod("2026-10");
  await waitText(otherPeriodTitle);
  await selectPeriod(period);
  await waitText(reviewTitle);
  await clickBatchButton(reviewTitle, "查看明细");
  await waitText("逐条核对计算依据");
  await expectButtonsAbsent(["退回修改", "审批锁定", "确认审批锁定"]);
  await closeModal();
  await shot("admin-dashboard-1440");
  await clickNav("建设方案");
  await waitText("14 个功能模块，逐项列清差距");
  await page.click('[data-capability-id="C09"]');
  await waitText("草稿编辑重算");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".blueprint-drawer-layer", { hidden: true });
  await page.click('[data-capability-id="C10"]');
  await waitText("员工可查看并确认本人分润");
  await waitText("完整结果发布、结果确认和申诉办理尚未实现");
  await shot("blueprint-v5-1440");
  await page.keyboard.press("Escape");
  await page.waitForSelector(".blueprint-drawer-layer", { hidden: true });
  await logout();
  readback.lockedScore = ledgerScore;
  pass("管理员明细只读，期间过滤正确，工作台仅汇总已锁定批次积分");
  pass("建设方案同步展示草稿编辑、本人确认及未交付的结果发布与申诉边界");

  await login("reviewer", "刘文静");
  await selectPeriod(period);
  await clickNav("复核审批");
  await clickBatchButton(reviewTitle, "进入复核");
  await waitText("逐条核对计算依据");
  await waitText(ruleId);
  await waitText("3,200.00");
  await shot("reviewer-detail-1440");
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewport({ width, height: width === 375 ? 812 : 1000, deviceScaleFactor: 1 });
    const label = `复核批次明细-${width}`;
    await noOverflow(width, label);
    if (width === 375) {
      await touchCheck(label);
      await shot("reviewer-detail-375");
    }
  }
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await clickButton("退回修改");
  await page.type(".batch-review-action textarea", "页面验收退回：请核对业务输入和人员后重新提交");
  await shot("reviewer-return-1440");
  await clickButton("确认退回");
  await page.waitForSelector(".modal-layer", { hidden: true });
  await waitText("批次已退回");
  await logout();
  pass("复核人员查看完整明细并完成四种宽度检查，填写原因后实际退回");

  await login("branch", "陈嘉宁");
  await selectPeriod(period);
  await clickNav("批次管理");
  await waitText("页面验收退回：请核对业务输入和人员后重新提交");
  await clickBatchButton(reviewTitle, "查看明细");
  await clickButton("编辑明细");
  const businessInput = `input[aria-label="${manager.user.name}当月业务值"]`;
  await page.click(businessInput, { clickCount: 3 });
  await page.type(businessInput, "256");
  await shot("branch-edit-1440");
  await clickButton("保存修改");
  await page.waitForSelector(".modal-layer", { hidden: true });
  await waitText("修改已保存");
  await clickBatchButton(reviewTitle, "查看明细");
  await waitText("6,400.00");
  await closeModal();
  await clickBatchButton(reviewTitle, "重新提交");
  await waitText("批次已提交复核");
  await logout();
  pass("提交机构编辑退回草稿，服务端重算为6400积分后重新提交");

  await login("reviewer", "刘文静");
  await selectPeriod(period);
  await clickNav("复核审批");
  await clickBatchButton(reviewTitle, "进入复核");
  await waitText("6,400.00");
  await clickButton("审批锁定");
  await clickButton("确认审批锁定");
  await page.waitForSelector(".modal-layer", { hidden: true });
  await waitText("审批完成");
  await clickBatchButton(reviewTitle, "查看明细");
  await waitText("已锁定");
  const cdp = await page.createCDPSession();
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath });
  await clickButton("导出明细");
  let downloaded = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const files = fs.readdirSync(downloadPath).filter((file) => file.endsWith(".csv") && file.includes(`批次${reviewBatch.id}-计价明细`));
    if (files.length) { downloaded = files[0]; break; }
    await sleep(100);
  }
  assert.ok(downloaded, "批次明细 CSV 未实际下载");
  const csv = fs.readFileSync(path.join(downloadPath, downloaded), "utf8");
  assert.ok(csv.includes(ruleId));
  assert.ok(csv.includes("256"));
  assert.ok(csv.includes("6400"));
  assert.ok(csv.includes("计算过程"));
  readback.download = { file: downloaded, bytes: Buffer.byteLength(csv), ruleId };
  await shot("reviewer-locked-detail-1440");
  await closeModal();
  await logout();
  pass("修改后批次经独立审批锁定，完整明细 CSV 真实下载且内容一致");

  await login("employee", "周明远");
  await selectPeriod(period);
  await clickNav("业绩归属");
  await waitText("V5页面办理闭环指标");
  await clickShareButton(employee.user.name, "确认无误");
  await waitHeading("确认本人分润");
  await waitText("40%");
  await waitText("不代表薪酬审批或结果发布");
  await shot("employee-confirm-1440");
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await noOverflow(375, "本人分润确认弹窗");
  await touchCheck("本人分润确认弹窗");
  await shot("employee-confirm-375");
  await clickButton("确认本人分润");
  await page.waitForSelector(".modal-layer", { hidden: true });
  await waitText("本人分润归属已确认");
  const confirmationTarget = { name: employee.user.name, runId };
  await page.waitForFunction(({ name, runId: targetRun }) => [...document.querySelectorAll(".share-row")].some((row) => row.textContent?.includes(name) && row.textContent.includes(targetRun) && row.textContent.includes("已确认")), {}, confirmationTarget);
  const confirmedRow = await page.$$eval(".share-row", (rows, { name, runId: targetRun }) => rows.filter((row) => row.textContent?.includes(name) && row.textContent.includes(targetRun)).map((row) => row.textContent), confirmationTarget);
  assert.ok(confirmedRow.some((text) => text.includes("已确认")));
  assert.equal(confirmedRow.some((text) => text.includes("确认无误")), false);
  await noOverflow(375, "员工分润页");
  await touchCheck("员工分润页");
  await shot("employee-confirmed-375");
  await logout();
  pass("员工在真实弹窗核对比例并完成本人确认，状态和待办刷新且移动端可操作");

  assert.deepEqual(consoleErrors, [], `浏览器控制台或页面异常：${JSON.stringify(consoleErrors)}`);
  assert.deepEqual(badResponses, [], `浏览器出现失败响应：${JSON.stringify(badResponses)}`);
  pass("V5全流程无未预期控制台错误、页面异常、资源404或失败响应");
} catch (error) {
  failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  exitCode = 1;
  console.error(error);
  if (page) {
    try { await shot("browser-failure"); } catch { /* 保留原始失败 */ }
  }
} finally {
  if (loggedIn && page) {
    try {
      await logout();
    } catch (error) {
      cleanupErrors.push(`浏览器会话退出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (browser) {
    try { await browser.close(); } catch (error) { cleanupErrors.push(`浏览器关闭失败：${error instanceof Error ? error.message : String(error)}`); }
  }
  const logoutResults = await Promise.allSettled(sessions.map((session) => session.client.auth.logout.mutate()));
  if (logoutResults.some((item) => item.status === "rejected")) cleanupErrors.push("部分 API 验收会话未能正常退出");
  try {
    const db = getDb();
    const testRule = await db.query.pricingRules.findFirst({ where: eq(pricingRules.id, ruleId) });
    if (testRule && testRule.status !== "disabled") {
      await db.update(pricingRules).set({ status: "disabled", version: testRule.version + 1, updatedAt: new Date() }).where(eq(pricingRules.id, ruleId));
    }
  } catch (error) {
    cleanupErrors.push(`测试指标停用失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (cleanupErrors.length) exitCode = 1;
  result = {
    status: exitCode === 0 ? "pass" : "fail",
    startedAt,
    finishedAt: new Date().toISOString(),
    command,
    baseUrl,
    checkCount: checks.length,
    checks,
    responsive,
    screenshots,
    consoleErrors,
    badResponses,
    readback,
    cleanupErrors,
    error: failure,
  };
  finish(result, exitCode);
  try {
    const client = getDb().$client;
    await client?.end?.();
  } catch {
  }
  console.log(JSON.stringify(result));
  process.exitCode = exitCode;
}
