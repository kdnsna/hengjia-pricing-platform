import assert from "node:assert/strict";
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const command = "node verifier/v3/verify-blueprint.mjs";
const logPath = "verifier/runs/v3-blueprint.log";
const resultPath = "verifier/runs/v3-blueprint-result.json";
const startedAt = new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;

function finish(result, exitCode) {
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  fs.appendFileSync(logPath, `\n# ${startedAt}\n$ ${command}\n${JSON.stringify(result)}\nexit=${exitCode}\n`);
}

try {
  browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const consoleErrors = [];
  const badResponses = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

  async function waitText(text) {
    await page.waitForFunction((value) => document.body.innerText.includes(value), { timeout: 20000 }, text);
  }
  async function clickNav(label) {
    const clicked = await page.evaluate((value) => {
      const button = [...document.querySelectorAll(".main-nav button")].find((item) => item.textContent?.trim() === value);
      if (!button) return false;
      button.click();
      return true;
    }, label);
    assert.equal(clicked, true, `找不到主导航：${label}`);
    await sleep(180);
  }
  async function clickTab(label) {
    const clicked = await page.evaluate((value) => {
      const button = [...document.querySelectorAll(".blueprint-tabs button")].find((item) => item.textContent?.includes(value));
      if (!button) return false;
      button.click();
      return true;
    }, label);
    assert.equal(clicked, true, `找不到蓝图视图：${label}`);
    await sleep(180);
  }
  async function clickRail(label, group = 1) {
    const clicked = await page.evaluate((value, groupIndex) => {
      const button = [...document.querySelectorAll(`.capability-rail .rail-group:nth-child(${groupIndex}) button`)].find((item) => item.textContent?.includes(value));
      if (!button) return false;
      button.click();
      return true;
    }, label, group);
    assert.equal(clicked, true, `找不到能力筛选项：${label}`);
    await sleep(150);
  }
  async function clickSourceFilter(label) {
    const clicked = await page.evaluate((value) => {
      const button = [...document.querySelectorAll(".source-filter button")].find((item) => item.textContent?.includes(value));
      if (!button) return false;
      button.click();
      return true;
    }, label);
    assert.equal(clicked, true, `找不到来源筛选项：${label}`);
    await sleep(150);
  }
  async function setSearch(value) {
    await page.evaluate((next) => {
      const input = document.querySelector('input[aria-label="搜索能力地图"]');
      if (!(input instanceof HTMLInputElement)) throw new Error("缺少能力搜索框");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await sleep(160);
  }
  async function cardCount(expected, label) {
    const count = await page.$$eval(".capability-card", (items) => items.length);
    assert.equal(count, expected, `${label}：能力卡数量错误`);
  }
  async function noOverflow(label) {
    const size = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(size.scroll <= size.client + 1, `${label} 横向页面溢出 ${size.scroll}/${size.client}`);
    return size;
  }
  async function touchCheck(label) {
    const small = await page.evaluate(() => [...document.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && (rect.width < 44 || rect.height < 44);
    }).map((button) => ({ text: button.textContent?.trim(), aria: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
    assert.deepEqual(small, [], `${label} 存在小于44px的可见按钮`);
  }
  async function screenshot(name) {
    await page.screenshot({ path: `verifier/runs/v3-${name}.png`, fullPage: true });
  }

  const root = await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 60000 });
  assert.equal(root?.status(), 200);
  await waitText("全员计价，一屏看清");
  await waitText("51项已载入");

  const navigation = [
    ["计价规则", "一套标准，管全产品"],
    ["指标设计", "指标，从定义到发布"],
    ["计价试算", "先算清，再入账"],
    ["业绩归属", "业绩归谁，规则说清"],
    ["异常校验", "让问题停在入账前"],
    ["审核与版本", "结果可追溯，版本可回放"],
    ["平台蓝图", "从计价引擎"],
    ["经营总览", "全员计价，一屏看清"],
  ];
  for (const [label, anchor] of navigation) {
    await clickNav(label);
    await waitText(anchor);
    assert.equal(await page.$eval(".main-nav button[aria-current='page']", (item) => item.textContent?.trim()), label);
  }

  await clickNav("平台蓝图");
  await waitText("14 个能力域，一张差距地图");
  assert.equal(await page.$$eval(".blueprint-hero-matrix > div", (items) => items.length), 4);
  assert.equal(await page.$$eval(".blueprint-tabs [role='tab']", (items) => items.length), 5);
  await cardCount(14, "初始能力地图");
  const coverageCounts = {};
  for (const [label, key, expected] of [["已有能力", "current", 3], ["部分覆盖", "partial", 5], ["规划中", "planned", 6]]) {
    await clickRail(label);
    await cardCount(expected, label);
    assert.equal(await page.$$eval(".capability-card", (items, status) => items.every((item) => item.classList.contains(`coverage-${status}`)), key), true);
    coverageCounts[key] = expected;
  }
  await clickRail("全部能力");
  await clickRail("组织与方案", 2);
  await cardCount(3, "组织与方案分组");
  await clickRail("全部", 2);
  await setSearch("申诉");
  await cardCount(1, "关键词申诉");
  assert.equal(await page.$eval(".capability-card", (item) => item.getAttribute("data-capability-id")), "C10");
  await setSearch("绝无此能力-EMPTY");
  await waitText("没有匹配的能力域");
  await page.click(".blueprint-empty button");
  await sleep(180);
  await cardCount(14, "清空筛选");

  await page.click('[data-capability-id="C04"]');
  await page.waitForSelector(".blueprint-drawer", { visible: true });
  await waitText("已有 51 项年度规则");
  assert.equal(await page.$$eval(".drawer-module-links button", (items) => items.length), 2);
  assert.equal(await page.$$eval(".drawer-feature-list li", (items) => items.length), 5);
  assert.equal(await page.$$eval(".drawer-sources a", (items) => items.length), 6);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".blueprint-drawer", { hidden: true });

  await page.click('[data-capability-id="C10"]');
  await page.waitForSelector(".blueprint-drawer", { visible: true });
  await waitText("当前没有员工自助门户");
  assert.equal(await page.$(".drawer-module-links"), null, "规划能力不得伪造现有功能跳转");
  await page.click('button[aria-label="关闭能力详情"]');
  await page.waitForSelector(".blueprint-drawer", { hidden: true });

  await page.click('[data-capability-id="C07"]');
  await page.waitForSelector(".blueprint-drawer", { visible: true });
  const jumped = await page.evaluate(() => {
    const button = [...document.querySelectorAll(".drawer-module-links button")].find((item) => item.textContent?.trim() === "计价试算");
    if (!button) return false;
    button.click();
    return true;
  });
  assert.equal(jumped, true);
  await waitText("先算清，再入账");
  assert.equal(await page.$(".blueprint-page"), null);
  await clickNav("平台蓝图");
  await waitText("14 个能力域，一张差距地图");

  const downloadDir = "/tmp/hengjia-v3-downloads";
  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir, eventsEnabled: true });
  await page.click(".blueprint-export");
  await waitText("已导出完整清单");
  let csvPath;
  for (let index = 0; index < 40; index += 1) {
    const names = fs.readdirSync(downloadDir);
    csvPath = names.find((name) => !name.endsWith(".crdownload") && fs.statSync(`${downloadDir}/${name}`).isFile());
    if (csvPath && !names.some((name) => name.endsWith(".crdownload"))) break;
    await sleep(100);
  }
  assert.ok(csvPath, "能力差距 CSV 未真实下载");
  const csv = fs.readFileSync(`${downloadDir}/${csvPath}`, "utf8");
  assert.equal(csv.trim().split("\r\n").length, 15, "CSV 应含表头和14项能力");
  assert.ok(csv.includes("员工确认与申诉") && csv.includes("规划中") && csv.includes("已有能力"));
  assert.equal(csv.charCodeAt(0), 0xfeff, "CSV 必须包含中文 Excel 兼容 BOM");

  await clickTab("目标架构");
  await waitText("六层解耦，四本账分清");
  await waitText("计价积分 ≠ 应发工资");
  assert.equal(await page.$$eval(".architecture-layer", (items) => items.length), 6);
  assert.equal(await page.$$eval(".ledger-boundary-grid article", (items) => items.length), 4);
  assert.equal(await page.$$eval(".blueprint-entity-table tbody tr", (items) => items.length), 17);
  assert.equal(await page.$$eval(".control-grid article", (items) => items.length), 8);

  await clickTab("治理流程");
  await waitText("从方案到追索，状态全程有据");
  const flowNames = ["方案制定", "目标分解", "数据接入与放行", "归属确认", "核算试算", "风险合规调整", "结果复核", "发布与确认", "申诉与更正", "薪酬测算交接", "支付与递延", "追索与结案"];
  assert.equal(await page.$$eval(".governance-map > button", (items) => items.length), 12);
  for (let index = 0; index < flowNames.length; index += 1) {
    const id = `G${String(index + 1).padStart(2, "0")}`;
    await page.click(`[data-flow-id="${id}"]`);
    await page.waitForFunction((name) => document.querySelector(".governance-detail h3")?.textContent === name, { timeout: 10000 }, flowNames[index]);
    assert.equal(await page.$eval(`[data-flow-id="${id}"]`, (item) => item.getAttribute("aria-pressed")), "true");
  }
  await waitText("覆盖离职退休人员");
  assert.equal(await page.$$eval(".branch-rules article", (items) => items.length), 4);
  assert.equal(await page.$$eval(".design-decision-grid article", (items) => items.length), 6);

  await clickTab("建设路线");
  await waitText("先补底线，再扩闭环，后做智能");
  assert.equal(await page.$$eval(".roadmap-phase", (items) => items.length), 3);
  assert.deepEqual(await page.$$eval(".roadmap-phase > header > span", (items) => items.map((item) => item.textContent)), ["P0", "P1", "P2"]);
  assert.equal(await page.$$eval(".roadmap-phase .roadmap-list", (items) => items.length), 9);
  assert.equal(await page.$$eval(".external-boundary-list article", (items) => items.length), 5);
  await waitText("每阶段共同准出条件");

  await clickTab("研究依据");
  await waitText("要求、实践与建议，分开陈述");
  assert.equal(await page.$$eval(".source-card", (items) => items.length), 18);
  await clickSourceFilter("成熟产品实践");
  assert.equal(await page.$$eval(".source-card", (items) => items.length), 4);
  assert.equal(await page.$$eval(".source-group", (items) => items.length), 1);
  await clickSourceFilter("监管、准则与官方标准");
  assert.equal(await page.$$eval(".source-card", (items) => items.length), 14);
  await clickSourceFilter("全部来源");
  assert.equal(await page.$$eval(".source-card", (items) => items.length), 18);
  const links = await page.$$eval(".source-card > a", (items) => items.map((item) => ({ href: item.href, target: item.target, rel: item.rel })));
  assert.equal(new Set(links.map((item) => item.href)).size, 18);
  assert.ok(links.some((item) => item.href === "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=174506"), "R10 必须使用可读取正文的金融监管总局正式原文");
  for (const link of links) {
    assert.match(link.href, /^https?:\/\//);
    assert.equal(link.target, "_blank");
    assert.match(link.rel, /noreferrer/);
  }
  await waitText("重庆辖内银行业金融机构；此处仅作为地方监管细化参考");
  await waitText("本项目设计建议 · 非监管原文");

  const viewNames = ["能力地图", "目标架构", "治理流程", "建设路线", "研究依据"];
  const screenshotNames = ["capabilities", "architecture", "flow", "roadmap", "sources"];
  const responsive = [];
  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewport({ width, height: width === 375 ? 812 : 1000, deviceScaleFactor: 1 });
    await sleep(180);
    for (let index = 0; index < viewNames.length; index += 1) {
      await clickTab(viewNames[index]);
      const size = await noOverflow(`${width}px ${viewNames[index]}`);
      if (width === 375) await touchCheck(`375px ${viewNames[index]}`);
      responsive.push({ width, view: viewNames[index], ...size, touch: width === 375 ? "pass" : "not_applicable" });
      if (width === 1440 || width === 375) await screenshot(`${screenshotNames[index]}-${width === 375 ? "mobile" : "desktop"}`);
    }
  }

  await clickTab("能力地图");
  await page.click('[data-capability-id="C04"]');
  await page.waitForSelector(".blueprint-drawer", { visible: true });
  await noOverflow("375px 能力详情抽屉");
  await touchCheck("375px 能力详情抽屉");
  const drawerRect = await page.$eval(".blueprint-drawer", (item) => {
    const rect = item.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(drawerRect.left >= 0 && drawerRect.right <= 376 && drawerRect.top === 0 && drawerRect.bottom === drawerRect.viewportHeight, "移动抽屉必须完整覆盖当前视口");
  await page.screenshot({ path: "verifier/runs/v3-capability-drawer-mobile.png", fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForSelector(".blueprint-drawer", { hidden: true });
  await page.click(".menu-trigger");
  await page.waitForFunction(() => document.querySelector(".sidebar")?.classList.contains("is-open"));
  await clickNav("经营总览");
  await waitText("全员计价，一屏看清");
  assert.equal(await page.$eval(".sidebar", (item) => item.classList.contains("is-open")), false, "移动导航选择后应自动关闭");
  await noOverflow("375px 经营总览回归");

  assert.deepEqual(consoleErrors, [], `浏览器控制台错误：${consoleErrors.join(" | ")}`);
  assert.deepEqual(badResponses, [], `失败响应或404：${badResponses.join(" | ")}`);
  const result = {
    status: "pass",
    navigation: navigation.map(([label]) => label),
    capabilityCounts: { all: 14, ...coverageCounts, domainOrganization: 3, searchAppeal: 1, emptyReset: 14 },
    drawer: { escapeClose: true, plannedHasNoFakeModuleLink: true, existingModuleJump: "C07 → 计价试算", mobileRect: drawerRect },
    csv: { filename: csvPath, rowsIncludingHeader: 15, bom: true },
    architecture: { layers: 6, ledgers: 4, entities: 17, controls: 8 },
    governance: { stepsChecked: 12, branches: 4, designDecisions: 6 },
    roadmap: { phases: ["P0", "P1", "P2"], externalBoundaries: 5 },
    sources: { all: 18, requirements: 14, practices: 4, uniqueOfficialLinks: 18 },
    responsive,
    consoleErrors,
    badResponses,
    screenshots: ["capabilities-desktop", "architecture-desktop", "flow-desktop", "roadmap-desktop", "sources-desktop", "capabilities-mobile", "architecture-mobile", "flow-mobile", "roadmap-mobile", "sources-mobile", "capability-drawer-mobile"].map((name) => `verifier/runs/v3-${name}.png`),
  };
  finish(result, 0);
  console.log(JSON.stringify(result));
} catch (error) {
  const result = { status: "fail", error: error instanceof Error ? error.stack : String(error) };
  finish(result, 1);
  console.error(result);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
