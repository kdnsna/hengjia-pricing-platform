import puppeteer from "puppeteer-core";
import fs from "node:fs";
import assert from "node:assert/strict";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const client = createTRPCClient({ links: [httpBatchLink({ url: "http://localhost:3000/api/trpc", transformer: superjson })] });
const initialWorkspace = await client.pricing.workspace.query();
const initialBatches = JSON.stringify(initialWorkspace.batches);
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
const errors = [];
const badResponses = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function clickText(text, exact = true) {
  const clicked = await page.evaluate((text, exact) => {
    const elements = [...document.querySelectorAll("button")].filter((element) => exact ? element.textContent?.trim() === text || Boolean(element.closest(".design-stepper") && element.querySelector("strong")?.textContent?.trim() === text) : element.textContent?.includes(text));
    const element = elements.find((item) => item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0);
    if (!element) return false;
    element.click();
    return true;
  }, text, exact);
  if (!clicked) throw new Error(`找不到可见按钮：${text}`);
  await sleep(550);
}
async function clickRowButton(rowText, buttonText) {
  const clicked = await page.evaluate((rowText, buttonText) => {
    const row = [...document.querySelectorAll(".design-table tbody tr")].find((item) => item.textContent?.includes(rowText) && [...item.querySelectorAll("button")].some((button) => button.textContent?.trim() === buttonText));
    const button = row && [...row.querySelectorAll("button")].find((item) => item.textContent?.trim() === buttonText);
    if (!button) return false;
    button.click();
    return true;
  }, rowText, buttonText);
  if (!clicked) throw new Error(`找不到行操作：${rowText} / ${buttonText}`);
  await sleep(550);
}
async function clickAria(label) {
  const selector = `button[aria-label=${JSON.stringify(label)}]`;
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.click(selector);
  await sleep(500);
}
async function waitText(text) { await page.waitForFunction((value) => document.body.innerText.includes(value), { timeout: 20000 }, text); }
async function setField(label, value) {
  const changed = await page.evaluate((label, value) => {
    const field = [...document.querySelectorAll("label")].find((item) => item.textContent?.trim().startsWith(label));
    const input = field?.querySelector("input, textarea, select");
    if (!input) return false;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, label, value);
  if (!changed) throw new Error(`找不到字段：${label}`);
  await sleep(80);
}
async function fieldValue(label) {
  return page.evaluate((label) => {
    const field = [...document.querySelectorAll("label")].find((item) => item.textContent?.trim().startsWith(label));
    return field?.querySelector("input, textarea, select")?.value ?? null;
  }, label);
}
async function noOverflow(label) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (size.scroll > size.client + 1) throw new Error(`${label}横向页面溢出 ${size.scroll}/${size.client}`);
}
async function resultScore() { return page.$eval(".result-score", (element) => element.textContent ?? ""); }
async function assertScore(text) { await page.waitForFunction((text) => document.querySelector(".result-score")?.textContent?.includes(text), { timeout: 10000 }, text); }
async function simulatorHasRule(ruleId, expected) {
  await page.waitForFunction((ruleId, expected) => {
    const label = [...document.querySelectorAll("label")].find((item) => item.textContent?.trim().startsWith("计价产品"));
    const values = [...(label?.querySelector("select")?.options ?? [])].map((option) => option.value);
    return values.includes(ruleId) === expected;
  }, { timeout: 12000 }, ruleId, expected);
}
async function saveAndCheckBatch(ruleId, version) {
  await clickText("保存为试算批次", false);
  await waitText("试算批次已保存为草稿");
  const workspace = await client.pricing.workspace.query();
  const batch = workspace.batches.find((item) => item.resultSnapshot?.some?.((entry) => entry.ruleId === ruleId && entry.ruleVersion === version));
  assert.ok(batch, `未找到 ${ruleId} V${version} 的试算批次`);
  const snapshot = batch.resultSnapshot.find((entry) => entry.ruleId === ruleId && entry.ruleVersion === version);
  assert.equal(snapshot.ruleDefinition.id, ruleId);
  assert.equal(snapshot.ruleDefinition.positiveRate, version === 1 ? 25 : 30);
  return batch.id;
}
async function screenshot(name) { await page.screenshot({ path: `verifier/runs/v2-${name}.png`, fullPage: true }); }
async function closeModal() { await page.keyboard.press("Escape"); await sleep(350); }

let ruleId;
let archiveId;
let v1BatchId;
const baseName = "设计演练·有效客户净增";
const existingDraft = initialWorkspace.designs.find((design) => design.name.startsWith(baseName) && design.status === "draft");
let name = existingDraft?.name ?? baseName;
try {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 60000 });
  await waitText("全员计价，一屏看清");
  await clickText("指标设计");
  await waitText("指标，从定义到发布。");
  await noOverflow("桌面指标台账");
  await screenshot("designer-desktop");

  if (existingDraft) {
    ruleId = existingDraft.ruleId;
    await clickRowButton(ruleId, "继续设计");
  } else {
    await clickText("设计新指标");
  }
  await waitText("先把指标说清楚");
  ruleId = await fieldValue("指标编码");
  assert.match(ruleId, /^N\d{3}$/);
  if (!existingDraft) name = `${baseName}（${ruleId}）`;
  await setField("指标名称", name);
  await setField("指标分类", "客户");
  await setField("业务分组", "设计演练");
  await setField("计价单位", "元/户");
  await setField("指标业务定义", "仅用于验证指标设计、发布和试算链路；不属于年度权威计价指标，正式使用前须重新核验制度依据。");
  await setField("源系统 / 数据表", "演练数据（非生产取数）");
  await setField("取数M码", "M9100001");
  await setField("积分 / 展示M码", "M9100002");
  await setField("源数据单位", "户");
  assert.equal(await fieldValue("单位换算除数"), "1");
  await clickText("保存草稿");
  await waitText(`指标 ${ruleId} 已保存为设计草稿`);
  await screenshot("editor-basic-desktop");

  await clickText("计算与单价");
  await setField("存量 / 总量单价", "");
  await setField("正增单价", "25");
  await setField("负增扣减单价", "15");
  await clickText("公式设计");
  await setField("计价公式", "DIRECT / UNIT_FACTOR * UNKNOWN");
  await waitText("未知变量或函数：UNKNOWN");
  await screenshot("formula-invalid-desktop");
  await clickText("按算法重建");
  await clickText("考核细则");
  await setField("目标值", "100");
  await setField("考核权重", "5");
  await setField("考核与计提细则", "按当月净增户数计价，月末生成演练数据；经机构复核、责任部门确认后计入对应考核期间，跨月冲正按原期间追溯。");
  await setField("排除项、冲正与补录规则", "重复、无效及非演练数据不计价；冲正与补录均保留原业务期间、原因和复核记录。");

  await clickText("测试与发布");
  await clickText("公式设计");
  await setField("计价公式", "DIRECT / (CUR - CUR) * POS_RATE / UNIT_FACTOR");
  await clickText("测试与发布");
  await clickText("运行四组测试");
  await waitText("公式出现除零");
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("保存并提交复核"))?.disabled), true, "除零时提交按钮必须禁用");
  await screenshot("formula-zero-tests");
  await clickText("公式设计");
  await clickText("按算法重建");
  await clickText("测试与发布");
  await clickText("运行四组测试");
  await waitText("四组场景测试全部通过");
  const testText = await page.$eval(".test-table", (element) => element.textContent ?? "");
  assert.ok(testText.includes("3,200") && testText.includes("-630") && testText.includes("250"));
  await screenshot("four-tests-pass");
  await clickText("保存并提交复核");
  await waitText("指标已提交复核");
  await waitText("待复核");
  await screenshot("review-ready");
  await clickText("发布正式指标");
  await waitText("发布后，该指标将按当前公式");
  await clickText("确认发布");
  await waitText("已发布为正式指标 V1");

  let workspace = await client.pricing.workspace.query();
  let formal = workspace.rules.find((rule) => rule.id === ruleId);
  assert.equal(formal.version, 1);
  assert.equal(formal.status, "active");
  assert.equal(formal.definition.assessment.weight, 5);
  assert.equal(JSON.stringify(workspace.batches), initialBatches, "发布指标不得覆盖既有批次");

  await clickText("计价试算");
  await setField("计价产品", ruleId);
  await assertScore("3,200.00");
  await page.waitForFunction(() => document.querySelector(".result-meta")?.textContent?.includes("规则版本V1"));
  await screenshot("simulator-v1");
  v1BatchId = await saveAndCheckBatch(ruleId, 1);

  await clickText("指标设计");
  await clickRowButton(ruleId, "创建新版");
  await waitText("目标版本 V2");
  await waitText("当前正式 V1 在发布前保持有效");
  await clickText("计算与单价");
  await setField("正增单价", "30");
  await clickText("保存草稿");
  await clickText("返回指标台账");
  workspace = await client.pricing.workspace.query();
  assert.equal(workspace.rules.find((rule) => rule.id === ruleId).version, 1);
  assert.equal(workspace.designs.find((design) => design.ruleId === ruleId && design.status === "draft").baseVersion, 1);
  await clickText("计价试算");
  await setField("计价产品", ruleId);
  await assertScore("3,200.00");
  await page.waitForFunction(() => document.querySelector(".result-meta")?.textContent?.includes("规则版本V1"));

  await clickText("指标设计");
  await clickRowButton(ruleId, "继续设计");
  await clickText("测试与发布");
  await clickText("运行四组测试");
  await waitText("四组场景测试全部通过");
  await clickText("保存并提交复核");
  await waitText("指标已提交复核");
  await clickText("发布正式指标");
  await clickText("确认发布");
  await waitText("已发布为正式指标 V2");
  workspace = await client.pricing.workspace.query();
  formal = workspace.rules.find((rule) => rule.id === ruleId);
  assert.equal(formal.version, 2);
  assert.equal(formal.positiveRate, 30);
  assert.equal(workspace.designs.filter((design) => design.ruleId === ruleId && design.status === "published").length, 2);
  assert.ok(workspace.batches.find((batch) => batch.id === v1BatchId), "V2 发布不得删除 V1 批次");

  await clickText("计价试算");
  await setField("计价产品", ruleId);
  await assertScore("3,840.00");
  await page.waitForFunction(() => document.querySelector(".result-meta")?.textContent?.includes("规则版本V2"));
  await saveAndCheckBatch(ruleId, 2);
  await screenshot("simulator-v2");

  await clickText("指标设计");
  await clickAria(`查看${name}版本记录`);
  await waitText("版本记录");
  assert.equal(await page.$$eval(".history-row", (rows) => rows.length), 2);
  await screenshot("version-history");
  await closeModal();

  await clickText("设计新指标");
  archiveId = await fieldValue("指标编码");
  const archiveName = `设计演练·归档样本（${archiveId}）`;
  await setField("指标名称", archiveName);
  await clickText("保存草稿");
  await clickText("归档");
  await waitText("归档仅结束本次设计流程");
  await clickText("确认归档");
  await waitText("设计稿已归档");
  await waitText(archiveName);
  workspace = await client.pricing.workspace.query();
  assert.equal(workspace.designs.find((design) => design.ruleId === archiveId).status, "archived");
  assert.equal(workspace.rules.some((rule) => rule.id === archiveId), false);
  await clickAria(`查看${archiveName}版本记录`);
  await waitText("从未写入正式指标库");
  await waitText("已归档快照");
  await closeModal();

  await clickAria(`停用${name}`);
  await clickText("确认停用");
  await waitText(`${name} 已停用`);
  await clickText("计价试算");
  await simulatorHasRule(ruleId, false);
  await clickText("指标设计");
  await clickAria(`启用${name}`);
  await clickText("确认启用");
  await waitText(`${name} 已启用`);
  await clickText("计价试算");
  await simulatorHasRule(ruleId, true);
  await setField("计价产品", ruleId);
  await assertScore("3,840.00");
  await clickText("指标设计");
  await clickAria(`停用${name}`);
  await clickText("确认停用");
  await waitText(`${name} 已停用`);
  await clickText("计价试算");
  await simulatorHasRule(ruleId, false);

  await clickText("指标设计");
  for (const width of [1024, 768]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await sleep(250);
    await noOverflow(`${width}px 指标台账`);
  }
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await sleep(300);
  await noOverflow("移动端指标台账");
  await screenshot("designer-mobile");
  const smallButtons = await page.evaluate(() => [...document.querySelectorAll("button")].filter((button) => {
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (rect.height < 44 || rect.width < 44);
  }).map((button) => ({ text: button.textContent?.trim(), aria: button.getAttribute("aria-label"), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  assert.equal(smallButtons.length, 0, `移动端存在小于44px的按钮：${JSON.stringify(smallButtons)}`);
  await clickText("设计新指标");
  await noOverflow("移动端基本定义");
  await screenshot("editor-mobile-basic");
  await clickText("公式设计");
  await noOverflow("移动端公式设计");
  await screenshot("editor-mobile-formula");
  await clickText("测试与发布");
  await noOverflow("移动端测试发布");
  await screenshot("editor-mobile-tests");

  const finalWorkspace = await client.pricing.workspace.query();
  const finalRule = finalWorkspace.rules.find((rule) => rule.id === ruleId);
  assert.equal(finalRule.status, "disabled");
  assert.equal(finalRule.version, 5);
  assert.equal(finalWorkspace.designs.filter((design) => design.ruleId === ruleId && design.status === "published").length, 2);
  assert.ok(finalWorkspace.batches.find((batch) => batch.id === v1BatchId));
  assert.equal(errors.length, 0, `控制台错误：${errors.join(" | ")}`);
  assert.equal(badResponses.length, 0, `失败响应：${badResponses.join(" | ")}`);
  const result = { status: "pass", ruleId, finalRuleStatus: finalRule.status, finalRuleVersion: finalRule.version, publishedSnapshots: 2, archiveId, v1BatchId, viewports: [1440, 1024, 768, 375], smallButtons, consoleErrors: errors, badResponses, flows: ["新建与草稿持久化", "未知变量与除零阻断", "四组测试与复核", "发布V1与正式试算", "V2设计与旧版隔离", "发布V2与版本记录", "归档快照", "停用启用停用", "规则版本批次快照", "移动端编辑器"] };
  fs.writeFileSync("verifier/runs/v2-browser-result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await screenshot("failure").catch(() => {});
  const result = { status: "fail", ruleId, archiveId, error: error instanceof Error ? error.stack : String(error), consoleErrors: errors, badResponses };
  fs.writeFileSync("verifier/runs/v2-browser-result.json", JSON.stringify(result, null, 2));
  console.error(result);
  process.exitCode = 1;
} finally {
  await browser.close();
}
