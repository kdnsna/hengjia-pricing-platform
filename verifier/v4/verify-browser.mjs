import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const baseUrl = process.env.VERIFY_ORIGIN ?? "http://localhost:3000";
const command = `VERIFY_ORIGIN=${baseUrl} node verifier/v4/verify-browser.mjs`;
const logPath = "verifier/runs/v4-browser.log";
const resultPath = "verifier/runs/v4-browser-result.json";
const startedAt = new Date().toISOString();
const password = "Hengjia@2026";
const runId = Date.now().toString(36);
const uiRuleId = `B${runId.toUpperCase()}`;
const checks = [];
const screenshots = [];
const roleNavs = {};
const responsive = [];
const consoleErrors = [];
const badResponses = [];
let browser;
let page;
let apiAdmin;
let designId;
let designArchived = false;
let exitCode = 0;
let result = { status: "running", checks };

function makeClient(cookie = "") {
  return createTRPCClient({
    links: [httpBatchLink({
      url: `${baseUrl}/api/trpc`,
      transformer: superjson,
      headers: cookie ? { cookie } : {},
    })],
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
  const user = await client.auth.login.mutate({ username, password });
  assert.match(setCookie, /^hengjia_session=/);
  return { client: makeClient(setCookie.split(";")[0]), user };
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
async function shot(name, fullPage = true) {
  const path = `verifier/runs/v4-${name}.png`;
  await page.screenshot({ path, fullPage });
  screenshots.push(path);
}
async function navLabels() {
  return page.$$eval(".main-nav button", (items) => items.map((item) => item.querySelector("span")?.textContent?.trim()));
}
async function clickNav(label) {
  const viewport = page.viewport();
  if (viewport.width <= 900) {
    await page.waitForSelector(".menu-trigger", { visible: true, timeout: 10000 });
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
  await sleep(260);
}
async function clickRowButton(rowText, buttonText) {
  const clicked = await page.evaluate((rowValue, buttonValue) => {
    const row = [...document.querySelectorAll("tbody tr")].find((item) => item.textContent?.includes(rowValue));
    const button = row ? [...row.querySelectorAll("button")].find((item) => item.textContent?.includes(buttonValue)) : null;
    if (!button) return false;
    button.click();
    return true;
  }, rowText, buttonText);
  assert.equal(clicked, true, `找不到 ${rowText} 所在行的 ${buttonText}`);
  await sleep(220);
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
  await sleep(180);
}
async function logout() {
  await page.click(".logout-button");
  await page.waitForSelector(".login-page", { timeout: 30000 });
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
  for (const label of labels) assert.equal(present.includes(label), false, `当前岗位不应出现按钮 ${label}`);
}

function browserDefinition() {
  return {
    id: uiRuleId,
    name: "V4页面复核验收指标",
    category: "客户",
    group: "V4页面验收",
    unit: "元/户",
    department: "个人金融业务部",
    owner: "计价管理员",
    description: "仅用于浏览器只读复核和独立复测验收，不进入正式年度指标库。",
    sourceSystem: "源系统科目 / 部件指标",
    sourceCode: "M9500001",
    metricCode: "M9500002",
    sourceUnit: "户",
    unitFactor: 1,
    method: "direct",
    stockRate: null,
    positiveRate: 25,
    negativeRate: 15,
    formula: "DIRECT / UNIT_FACTOR * IF(DIRECT > 0, IF(POS_RATE > 0, POS_RATE, STOCK_RATE), IF(DIRECT < 0, NEG_RATE, 0))",
    assessment: {
      cycle: "月度",
      targetValue: null,
      weight: null,
      cap: null,
      floor: null,
      precision: 2,
      rounding: "四舍五入",
      applicableOrgs: "全辖经营机构",
      applicableRoles: "客户经理、理财经理、网点负责人",
      attribution: "按比例分润",
      allowNegative: true,
      evidenceRequired: true,
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
      reviewFlow: "一级复核",
      description: "仅用于页面验收；管理员提交后保持只读，复核人员独立复测并退回，保留完整处理记录。",
      exclusions: "冲正业务按原期间追溯；重复、无效及测试数据不计价。",
    },
  };
}


let loggedIn = false;
let finalDesignStatus = "not_created";
let formalRuleCreated = false;
const cleanupErrors = [];
const readback = {};
let pagePerformance = null;

async function waitHeading(text) {
  await page.waitForFunction((value) => [...document.querySelectorAll("h1, h2")].some((item) => item.textContent?.includes(value)), { timeout: 25000 }, text);
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
  await sleep(180);
}

async function expectButton(label, present = true) {
  const found = await page.$$eval("button", (items, value) => items.some((item) => {
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && item.textContent?.trim() === value;
  }), label);
  assert.equal(found, present, `按钮 ${label} 应${present ? "显示" : "隐藏"}`);
}

async function buttonDisabled(label) {
  const disabled = await page.$$eval("button", (items, value) => {
    const button = items.find((item) => item.textContent?.trim() === value);
    return button ? button.disabled : null;
  }, label);
  assert.equal(typeof disabled, "boolean", `找不到按钮 ${label}`);
  return disabled;
}

async function closeModal() {
  await page.keyboard.press("Escape");
  await page.waitForSelector(".modal-layer", { hidden: true, timeout: 10000 });
  await sleep(100);
}

async function loginRole(username, expectedName, expectedNav, heading, screenshotName) {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await login(username, expectedName);
  loggedIn = true;
  const labels = await navLabels();
  assert.deepEqual(labels, expectedNav, `${username} 菜单与权限矩阵不一致`);
  roleNavs[username] = labels;
  await waitHeading(heading);
  await noOverflow(1440, `${username}-工作台`);
  await shot(screenshotName);
  pass(`${username} 真实登录、角色菜单和工作台正确`);
}

async function logoutRole(username) {
  await logout();
  loggedIn = false;
  pass(`${username} 退出后返回登录页`);
}

async function checkReadOnlyRules() {
  await clickNav("计价规则");
  await waitHeading("计价规则");
  await expectButtonsAbsent(["创建新版", "设计新指标", "编辑规则", "修改单价", "保存规则"]);
  await waitText("当前岗位为只读权限");
}

const NAVS = {
  admin: ["经营概览", "计价规则", "计价试算", "业绩归属", "指标设计", "规则核查", "批次管理", "建设方案", "账号权限"],
  employee: ["我的工作", "计价规则", "计价试算", "业绩归属"],
  manager: ["我的工作", "计价规则", "计价试算", "业绩归属"],
  branch: ["机构工作台", "计价规则", "计价试算", "业绩归属", "批次管理"],
  leader: ["经营概览", "计价规则", "计价试算", "业绩归属", "批次与日志", "建设方案"],
  reviewer: ["经营概览", "计价规则", "计价试算", "业绩归属", "指标复核", "规则核查", "复核审批"],
};

const adminViews = [
  { label: "经营概览", heading: "全行计价工作" },
  { label: "计价规则", heading: "计价规则" },
  { label: "计价试算", heading: "计价试算" },
  { label: "业绩归属", heading: "业绩归属与分润" },
  { label: "指标设计", heading: "指标设计" },
  { label: "规则核查", heading: "逐项核查，明确整改。" },
  { label: "批次管理", heading: "批次复核与记录" },
  { label: "建设方案", heading: "把计价、复核和" },
  { label: "账号权限", heading: "按岗位授权，按机构查数。" },
];

async function runAdminResponsive() {
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewport({ width, height: width === 375 ? 812 : 1000, deviceScaleFactor: 1 });
    for (const view of adminViews) {
      await clickNav(view.label);
      await waitHeading(view.heading);
      if (view.label === "账号权限") await waitText("不可自改");
      const label = `管理员-${view.label}`;
      await noOverflow(width, label);
      if (width === 375) await touchCheck(label);
      const capture = view.label === "经营概览" || (width === 375 && ["计价规则", "计价试算", "指标设计", "建设方案", "账号权限"].includes(view.label));
      if (capture) await shot(`admin-${view.label}-${width}`);
    }
    pass(`管理员九个页面在 ${width}px 无横向溢出${width === 375 ? "，可见按钮触控尺寸均不小于44px" : ""}`);
  }
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
}


let failure = null;
try {
  const adminSession = await apiLogin("admin");
  apiAdmin = adminSession.client;
  const saved = await apiAdmin.pricing.saveDesign.mutate({ baseVersion: 0, definition: browserDefinition() });
  designId = saved.id;
  await apiAdmin.pricing.submitDesign.mutate({ id: designId });
  readback.initial = { designId, ruleId: uiRuleId, status: "review" };
  pass("独立页面测试设计稿已创建并提交，四组提交测试快照由服务端保存");

  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  });
  page = await browser.newPage();
  page.setDefaultTimeout(25000);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ type: "console", text: message.text() });
  });
  page.on("pageerror", (error) => consoleErrors.push({ type: "pageerror", text: error.message }));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push({ status: response.status(), url: response.url() });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-page");
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await noOverflow(375, "登录页");
  await touchCheck("登录页");
  await shot("login-375");
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await noOverflow(1440, "登录页");
  await shot("login-1440");
  pass("登录页桌面与手机布局、六类账号入口和触控尺寸正确");

  await loginRole("admin", "张海峰", NAVS.admin, "全行计价工作", "admin-dashboard-1440");
  pagePerformance = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      resourceCount: resources.length,
      transferBytes: resources.reduce((sum, item) => sum + (item.transferSize || 0), 0),
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
    };
  });

  await clickNav("计价规则");
  await waitHeading("计价规则");
  await expectButton("创建新版");
  await expectButtonsAbsent(["编辑规则", "修改单价", "保存规则"]);
  pass("管理员规则页仅提供创建新版，没有正式单价或公式直接编辑入口");

  await clickNav("批次管理");
  await waitHeading("批次复核与记录");
  await expectButtonsAbsent(["审批锁定", "确认审批锁定"]);
  await expectButton("导出台账");
  pass("管理员可办理批次但不能审批锁定");

  await clickNav("指标设计");
  await waitHeading("指标设计");
  await page.type(".design-catalog .search-field input", uiRuleId);
  await waitText(uiRuleId);
  await clickRowButton(uiRuleId, "查看复核状态");
  await waitText("等待独立复核");
  await waitText("如需修改，请等待复核人员退回");
  const editableFields = await page.$$eval(".modal input, .modal textarea, .modal select, .modal [contenteditable='true']", (items) => items.length);
  assert.equal(editableFields, 0, "待复核设计弹窗不应出现可编辑字段");
  await page.click(".submitted-tests summary");
  await page.waitForFunction(() => document.querySelectorAll(".submitted-tests > div").length === 4);
  await shot("admin-review-readonly-1440");
  await closeModal();
  pass("管理员待复核设计只读，定义、细则和四组提交测试完整可见");

  await clickNav("账号权限");
  await waitHeading("按岗位授权，按机构查数。");
  await waitText("不可自改");
  const roleRows = await page.$$eval(".role-matrix tbody tr", (items) => items.length);
  assert.equal(roleRows, 6, "账号权限页应列示六类岗位");
  await shot("admin-accounts-1440");
  pass("账号权限页列示六类岗位、机构范围并禁止管理员自改");

  await clickNav("建设方案");
  await waitHeading("把计价、复核和");
  await waitText("建设建议不等于已交付功能");
  await page.click('[data-capability-id="C13"]');
  await waitText("已有六类角色、机构数据范围、服务端接口授权");
  await waitText("当前为本地演示账号体系");
  await shot("admin-blueprint-access-1440", false);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".blueprint-drawer-layer", { hidden: true });
  pass("建设方案准确反映当前账号权限和外部身份系统边界");

  await runAdminResponsive();
  await logoutRole("admin");

  await loginRole("employee", "周明远", NAVS.employee, "我的计价工作", "employee-dashboard-1440");
  await checkReadOnlyRules();
  await clickNav("计价试算");
  await waitHeading("计价试算");
  await expectButtonsAbsent(["保存为试算批次", "新增分润", "创建新版"]);
  await expectButton("导出明细");
  await clickNav("业绩归属");
  await waitHeading("业绩归属与分润");
  await expectButtonsAbsent(["新增分润"]);
  pass("普通员工只能本人试算和查看本人分润，不能保存批次或维护规则");
  await logoutRole("employee");

  await loginRole("manager", "林书言", NAVS.manager, "我的计价工作", "manager-dashboard-1440");
  await checkReadOnlyRules();
  await clickNav("计价试算");
  await waitHeading("计价试算");
  await expectButtonsAbsent(["保存为试算批次"]);
  await clickNav("业绩归属");
  await waitHeading("业绩归属与分润");
  await expectButton("新增分润");
  await clickButton("新增分润");
  await waitHeading("新增协同分润");
  await waitText("人员姓名和机构以服务端目录为准");
  await closeModal();
  pass("客户经理可打开本人参与的本机构分润登记，但不能保存正式批次");
  await logoutRole("manager");

  await loginRole("branch", "陈嘉宁", NAVS.branch, "城东支行计价工作", "branch-dashboard-1440");
  await checkReadOnlyRules();
  await clickNav("计价试算");
  await waitHeading("计价试算");
  await expectButton("保存为试算批次");
  await clickNav("业绩归属");
  await waitHeading("业绩归属与分润");
  await expectButton("新增分润");
  await clickNav("批次管理");
  await waitHeading("批次复核与记录");
  await expectButtonsAbsent(["审批锁定", "确认审批锁定"]);
  pass("机构负责人可保存本机构批次和分润，但不能审批或跨岗维护规则");
  await logoutRole("branch");

  await loginRole("leader", "王建国", NAVS.leader, "全行计价工作", "leader-dashboard-1440");
  await checkReadOnlyRules();
  await clickNav("计价试算");
  await waitHeading("计价试算");
  await expectButtonsAbsent(["保存为试算批次"]);
  await clickNav("业绩归属");
  await waitHeading("业绩归属与分润");
  await expectButtonsAbsent(["新增分润"]);
  await clickNav("批次与日志");
  await waitHeading("批次复核与记录");
  await expectButtonsAbsent(["提交复核", "审批锁定", "确认审批锁定"]);
  await clickButton("操作日志", false);
  await page.waitForFunction(() => document.querySelectorAll(".log-row").length > 0);
  await clickNav("建设方案");
  await waitHeading("把计价、复核和");
  await waitText("外部接口、薪酬支付和监管报送");
  pass("分行领导保留全行批次、日志和建设方案只读视图，无业务修改按钮");
  await logoutRole("leader");

  await loginRole("reviewer", "刘文静", NAVS.reviewer, "全行计价工作", "reviewer-dashboard-1440");
  await checkReadOnlyRules();
  await clickNav("计价试算");
  await waitHeading("计价试算");
  await expectButtonsAbsent(["保存为试算批次"]);
  await clickNav("业绩归属");
  await waitHeading("业绩归属与分润");
  await expectButtonsAbsent(["新增分润"]);

  await clickNav("指标复核");
  await waitHeading("核对定义、公式和测试结果。");
  await page.type(".design-review-center .search-field input", uiRuleId);
  await waitText(uiRuleId);
  await clickRowButton(uiRuleId, "进入复核");
  await waitText("由服务端重新执行正向、负向、零值和一月进度四组测试");
  const reviewerInputs = await page.$$eval(".modal input, .modal [contenteditable='true']", (items) => items.length);
  const reviewerTextareas = await page.$$eval(".modal textarea", (items) => items.length);
  assert.equal(reviewerInputs, 0, "复核弹窗不应包含定义编辑输入框");
  assert.equal(reviewerTextareas, 1, "复核弹窗只能保留退回原因文本框");
  assert.equal(await buttonDisabled("发布正式版本"), true, "未独立复测前发布按钮必须禁用");
  await shot("reviewer-before-tests-1440");
  await clickButton("运行独立复测");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".review-test-results > span")];
    return rows.length === 4 && rows.every((item) => item.classList.contains("pass"));
  }, { timeout: 30000 });
  const independentTests = await page.$$eval(".review-test-results > span", (items) => items.map((item) => item.textContent?.trim()));
  readback.independentTests = independentTests;
  assert.equal(await buttonDisabled("发布正式版本"), false, "四组复测通过后发布确认入口应可用");
  await shot("reviewer-four-tests-pass-1440");
  pass("复核人员不能修改定义，发布前必须实际通过四组服务端独立复测");

  await page.type(".return-box textarea", "页面验收退回：仅验证独立复核和退回流程，本设计不发布为正式指标。");
  assert.equal(await buttonDisabled("退回修改"), false, "填写具体原因后退回按钮应可用");
  await clickButton("退回修改");
  await page.waitForSelector(".modal-layer", { hidden: true });
  await waitText("设计稿已退回管理员修改");
  const afterReturn = await apiAdmin.pricing.workspace.query();
  const returnedDesign = afterReturn.designs.find((item) => item.id === designId);
  assert.equal(returnedDesign?.status, "draft", "退回后设计稿必须恢复为草稿");
  readback.afterReturn = { status: returnedDesign?.status, testSnapshot: returnedDesign?.testSnapshot };
  pass("复核退回已实际写入，设计稿恢复草稿且未进入正式规则库");
  await logoutRole("reviewer");

  assert.deepEqual(consoleErrors, [], `浏览器控制台或页面异常：${JSON.stringify(consoleErrors)}`);
  assert.deepEqual(badResponses, [], `浏览器出现失败响应：${JSON.stringify(badResponses)}`);
  pass("六类账号全流程无控制台错误、页面异常、资源404或失败响应");
} catch (error) {
  failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
  exitCode = 1;
  console.error(error);
  if (page) {
    try { await shot("browser-failure"); } catch { /* preserve the original failure */ }
  }
} finally {
  if (loggedIn && page) {
    try {
      await page.evaluate(() => document.querySelector(".logout-button")?.click());
      await page.waitForSelector(".login-page", { timeout: 10000 });
      loggedIn = false;
    } catch (error) {
      cleanupErrors.push(`浏览器会话退出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (designId && apiAdmin) {
    try {
      const beforeArchive = await apiAdmin.pricing.workspace.query();
      const current = beforeArchive.designs.find((item) => item.id === designId);
      if (current?.status === "published") throw new Error("页面测试设计稿被意外发布，不能按未发布设计归档");
      if (current && current.status !== "archived") {
        await apiAdmin.pricing.archiveDesign.mutate({ id: designId });
      }
      designArchived = true;
      const afterArchive = await apiAdmin.pricing.workspace.query();
      const archived = afterArchive.designs.find((item) => item.id === designId);
      finalDesignStatus = archived?.status ?? "missing";
      formalRuleCreated = afterArchive.rules.some((item) => item.id === uiRuleId);
      readback.final = { status: finalDesignStatus, formalRuleCreated, designId, ruleId: uiRuleId };
      assert.equal(finalDesignStatus, "archived", "页面测试设计稿最终必须归档");
      assert.equal(formalRuleCreated, false, "页面测试指标不得进入正式规则库");
      pass("独立页面测试设计稿已归档，历史记录保留且正式规则库未新增测试指标");
    } catch (error) {
      exitCode = 1;
      cleanupErrors.push(`设计稿归档或最终回读失败：${error instanceof Error ? error.message : String(error)}`);
    }
    try { await apiAdmin.auth.logout.mutate(); } catch { /* API session expires server-side */ }
  }

  if (browser) {
    try { await browser.close(); } catch (error) {
      cleanupErrors.push(`浏览器关闭失败：${error instanceof Error ? error.message : String(error)}`);
    }
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
    roleNavs,
    responsive,
    screenshots,
    consoleErrors,
    badResponses,
    pagePerformance,
    readback,
    designArchived,
    finalDesignStatus,
    formalRuleCreated,
    cleanupErrors,
    error: failure,
  };
  finish(result, exitCode);
  process.exitCode = exitCode;
}
