import puppeteer from "puppeteer-core";
import fs from "node:fs";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
const errors = [];
const badResponses = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("response", r => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function clickText(text, exact = true) {
  const ok = await page.evaluate((text, exact) => {
    const els = [...document.querySelectorAll("button")].filter(e => exact ? e.textContent?.trim() === text : e.textContent?.includes(text));
    const el = els.find(e => e.getBoundingClientRect().width > 0);
    if (!el) return false; el.click(); return true;
  }, text, exact);
  if (!ok) throw new Error(`找不到按钮：${text}`);
  await sleep(500);
}
async function assertText(text) { await page.waitForFunction(t => document.body.innerText.includes(t), { timeout: 15000 }, text); }
async function noOverflow(label) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  if (size.scroll > size.client + 1) throw new Error(`${label}横向溢出 ${size.scroll}/${size.client}`);
}
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto("http://localhost:3000", { waitUntil: "networkidle0", timeout: 60000 });
await assertText("全员计价，一屏看清"); await assertText("51项已载入"); await noOverflow("桌面总览");
await page.screenshot({ path: "verifier/runs/desktop-final.png", fullPage: true });
await clickText("计价规则"); await assertText("一套标准，管全产品");
let rows = await page.$$eval(".rules-table tbody tr", r => r.length); if (rows !== 51) throw new Error(`规则行数${rows}≠51`);
await page.type(".search-field input", "实物金"); await sleep(400); rows = await page.$$eval(".rules-table tbody tr", r => r.length); if (rows !== 1) throw new Error("规则搜索失败");
await page.click('.rules-table tbody tr button[aria-label]'); await assertText("维护规则 · 实物金");
await page.type(".modal textarea", "验收：已与年度权威表核对500元/万元。");
await clickText("保存并留痕", false); await assertText("规则已保存");
await page.screenshot({ path: "verifier/runs/rules-final.png", fullPage: true });
await clickText("计价试算"); await assertText("先算清，再入账"); await assertText("802.92");
await clickText("负向扣减"); await assertText("-197.43");
await clickText("正向增长"); await assertText("802.92");
await page.screenshot({ path: "verifier/runs/simulator-final.png", fullPage: true });
await clickText("保存为试算批次", false); await assertText("试算批次已保存为草稿");
await clickText("业绩归属"); await assertText("业绩归谁，规则说清"); await clickText("新增分润");
const modalSelects = await page.$$(".modal select"); await modalSelects[1].select("P008");
await page.$eval('.modal input[type="number"]', e => { e.value = ""; });
await page.type('.modal input[type="number"]', "100");
await page.type(".modal textarea", "独立主办该笔趸缴保险业务，全额归属。");
await clickText("保存分润", false); await assertText("分润记录已保存并留痕"); await assertText("趸缴保险");
await clickText("异常校验"); await assertText("让问题停在入账前"); await clickText("高严重度", false); await assertText("引用断链");
await clickText("审核与版本"); await assertText("结果可追溯，版本可回放"); await clickText("提交复核", false); await assertText("批次已提交复核");
await clickText("审批锁定", false); await assertText("确认审批并锁定"); await clickText("确认审批锁定", false); await assertText("审批完成，批次与规则快照已锁定");
await page.screenshot({ path: "verifier/runs/approval-final.png", fullPage: true });
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
await clickText("经营总览"); await noOverflow("移动总览");
await page.screenshot({ path: "verifier/runs/mobile-final.png", fullPage: true });
await page.click(".menu-trigger"); await assertText("计价工作台"); await clickText("计价试算"); await assertText("先算清，再入账"); await noOverflow("移动试算");
await page.screenshot({ path: "verifier/runs/mobile-simulator.png", fullPage: true });
await browser.close();
const result = { status: errors.length || badResponses.length ? "fail" : "pass", rules: 51, desktop: "1440px", mobile: "375px", consoleErrors: errors, badResponses, flows: ["规则搜索与编辑", "正增/负增试算", "保存批次", "新增分润", "异常筛选", "提交复核", "审批锁定", "移动导航"] };
fs.writeFileSync("verifier/runs/browser-result.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.status !== "pass") process.exit(1);
