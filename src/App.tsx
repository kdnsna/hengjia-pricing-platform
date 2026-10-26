import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LayoutDashboard, SlidersHorizontal, Calculator, GitBranch, ShieldCheck, Layers3,
  Search, Bell, CircleHelp, Download, Menu, X, ChevronRight,
  Check, Clock3, LockKeyhole, FileCheck2, Plus, Users, Building2,
  Database, CircleCheck, CircleAlert, Info, RotateCcw, Send, Eye, BadgeCheck,
  Network, BookOpen, ChevronDown, ListFilter, SquarePen, LogOut, UserCog,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { getQueryKey } from "@trpc/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { calculate, METHOD_LABELS, type CalcInput, type Category, type IndicatorDefinition, type IndicatorDesignRecord, type PricingRule } from "@contracts/pricing";
import { hasPermission, ROLE_DEFINITIONS, type AccessUser, type Permission } from "@contracts/access";
import { IndicatorDesigner } from "@/components/IndicatorDesigner";
import { PlatformBlueprint } from "@/components/PlatformBlueprint";
import { LoginPage } from "@/components/LoginPage";
import { AccountCenter } from "@/components/AccountCenter";
import { DesignReviewCenter } from "@/components/DesignReviewCenter";
import { WorkDashboard } from "@/components/WorkDashboard";
import { BatchDetailModal, type BatchRecord } from "@/components/BatchDetailModal";
import { Modal } from "@/components/Modal";
import { exportCsv } from "@/lib/exportCsv";
import "./index.css";
import "./access.css";

type View = "dashboard" | "blueprint" | "rules" | "designer" | "simulator" | "allocation" | "validation" | "approval" | "accounts";
type Toast = { message: string; tone?: "success" | "error" };

const NAV: Array<{ id: View; label: string; icon: typeof LayoutDashboard; permission?: Permission }> = [
  { id: "dashboard", label: "工作台", icon: LayoutDashboard },
  { id: "rules", label: "计价规则", icon: SlidersHorizontal },
  { id: "simulator", label: "计价试算", icon: Calculator },
  { id: "allocation", label: "业绩归属", icon: GitBranch },
  { id: "designer", label: "指标设计", icon: SquarePen, permission: "design:view" },
  { id: "validation", label: "规则核查", icon: ShieldCheck, permission: "validation:view" },
  { id: "approval", label: "批次管理", icon: Layers3, permission: "batch:view" },
  { id: "blueprint", label: "建设方案", icon: Network, permission: "blueprint:view" },
  { id: "accounts", label: "账号权限", icon: UserCog, permission: "accounts:manage" },
];

function navLabel(id: View, user: AccessUser): string {
  if (id === "dashboard") return user.scope === "self" ? "我的工作" : user.scope === "branch" ? "机构工作台" : "经营概览";
  if (id === "designer" && user.role === "reviewer") return "指标复核";
  if (id === "approval" && user.role === "reviewer") return "复核审批";
  if (id === "approval" && user.role === "executive") return "批次与日志";
  return NAV.find((item) => item.id === id)?.label ?? "工作台";
}

const ANOMALIES = [
  { id: "A01", level: "高", type: "引用断链", object: "商业养老金保险", detail: "积分行仍引用旧码 M9991807；现取数行为 M9992088", suggestion: "改为引用 M9992088，并重算受影响月份", status: "待处理" },
  { id: "A02", level: "高", type: "引用断链", object: "基金（含专户）", detail: "积分行引用 M9991109，未指向现行取数行 M9992089", suggestion: "建立取数行→积分行强引用校验", status: "待处理" },
  { id: "A03", level: "高", type: "重复计价", object: "个人养老金缴费账户", detail: "旧公式使用累计值×3×13.33，可能跨月重复计价", suggestion: "改用当月净增 M9992083×3", status: "待处理" },
  { id: "A04", level: "高", type: "单价不一致", object: "实物贵金属", detail: "旧公式为300元/万元，年度标准为500元/万元", suggestion: "按权威单价修正并追溯差异", status: "待处理" },
  { id: "A05", level: "高", type: "负增单价", object: "对私存款日均", detail: "旧公式负增单价2.22，年度标准为2.34", suggestion: "全量替换4处同类错误", status: "待处理" },
  { id: "A06", level: "中", type: "月份参数", object: "对私存款增量", detail: "7月公式中残留×5、×6等历史月份参数", suggestion: "由期间参数自动注入n与n−1", status: "观察中" },
  { id: "A07", level: "中", type: "指标缺失", object: "信用卡活户净增", detail: "年度标准55元/户，旧版公式清单未覆盖", suggestion: "补充取数映射后启用", status: "待补映射" },
  { id: "A08", level: "低", type: "零值分支", object: "增量类规则", detail: "旧IF仅含>0与<0，等于0时结果落空", suggestion: "现行计算规则显式返回0并保留零值标识", status: "已内建" },
];

function WorkspaceApp({ user, onLogout }: { user: AccessUser; onLogout: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [period, setPeriod] = useState("2026-10");
  const [toast, setToast] = useState<Toast | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [designRule, setDesignRule] = useState<PricingRule | null>(null);
  const workspace = trpc.pricing.workspace.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onMutate: async () => {
      await Promise.all([utils.pricing.workspace.cancel(), utils.auth.listUsers.cancel()]);
    },
    onSuccess: onLogout,
    onError: (error) => notify(error.message, "error"),
  });
  const availableNav = useMemo(() => NAV.filter((item) => !item.permission || hasPermission(user, item.permission)), [user]);
  const activeView = availableNav.some((item) => item.id === view) ? view : "dashboard";
  const notify = (message: string, tone: Toast["tone"] = "success") => setToast({ message, tone });
  const refresh = () => utils.pricing.workspace.invalidate();

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (workspace.error?.data?.code === "UNAUTHORIZED") onLogout();
  }, [workspace.error, onLogout]);

  const rules: PricingRule[] = useMemo(() => (workspace.data?.rules ?? []).map((row) => ({
    id: row.id, name: row.name, category: row.category as Category, group: row.groupName, unit: row.unit as PricingRule["unit"],
    stockRate: row.stockRate, positiveRate: row.positiveRate, negativeRate: row.negativeRate,
    method: row.method as PricingRule["method"], sourceCode: row.sourceCode ?? undefined, metricCode: row.metricCode ?? undefined,
    status: row.status as PricingRule["status"], note: row.note ?? undefined,
    formula: row.formula ?? undefined, version: row.version, definition: row.definition as IndicatorDefinition | undefined, updatedAt: row.updatedAt,
  })), [workspace.data]);
  const activeRules = useMemo(() => rules.filter((rule) => rule.status === "active"), [rules]);
  const designs = useMemo<IndicatorDesignRecord[]>(() => (workspace.data?.designs ?? []).map((row) => ({
    ...row,
    status: row.status as IndicatorDesignRecord["status"],
    definition: row.definition as IndicatorDefinition,
    testSnapshot: row.testSnapshot as IndicatorDesignRecord["testSnapshot"],
  })), [workspace.data]);
  const periodOptions = useMemo(() => {
    const values = new Set<string>(["2026-10", "2026-09", "2026-08", "2026-07", period]);
    workspace.data?.batches.forEach((batch) => values.add(batch.period));
    workspace.data?.shares.forEach((share) => values.add(share.period));
    return [...values].sort((a, b) => b.localeCompare(a));
  }, [workspace.data, period]);

  const go = (next: View) => {
    if (!availableNav.some((item) => item.id === next)) return;
    setView(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const openDesigner = (rule?: PricingRule) => { setDesignRule(rule ?? null); go("designer"); };
  const activeLabel = navLabel(activeView, user);
  const allowedTargets = availableNav.map((item) => item.id);
  const helpItems = [
    { view: "designer" as View, permission: "design:manage" as Permission, title: "维护指标", text: "配置定义、算法、单价、公式和考核细则，测试通过后提交复核。" },
    { view: "simulator" as View, title: "进行试算", text: hasPermission(user, "batch:save") ? "选择人员、期间和产品，录入业务数据；保存时由服务端重新计算。" : "选择本人、期间和产品，录入业务数据，核对计算过程。员工试算不生成正式批次。" },
    { view: "allocation" as View, title: "核对归属", text: hasPermission(user, "allocation:manage") ? "登记协同分润，并由各参与人确认本人记录；同一期间、同一产品的比例合计不得超过100%。" : "查看并确认本人分润记录、比例和依据，不能代替其他人员确认。" },
    { view: "approval" as View, permission: "batch:view" as Permission, title: "办理批次", text: hasPermission(user, "batch:approve") ? "逐条核对批次明细，填写原因退回或审批锁定；提交人不能复核本人提交的内容。" : hasPermission(user, "batch:submit") ? "查看明细和退回原因，修改后重新提交，由独立复核人员审批锁定。" : "查看权限范围内的批次明细、状态和操作记录。" },
  ].filter((item) => !item.permission || hasPermission(user, item.permission));
  const reviewBatches = (workspace.data?.batches ?? []).filter((batch) => batch.status === "review");
  const reviewDesigns = designs.filter((design) => design.status === "review");
  const pendingShares = (workspace.data?.shares ?? []).filter((share) => share.status !== "approved");
  const noticeItems: Array<{ view: View; title: string; detail: string }> = [];
  if (hasPermission(user, "design:view") && reviewDesigns.length) noticeItems.push({ view: "designer", title: `${reviewDesigns.length}项指标等待复核`, detail: user.role === "reviewer" ? "请独立复测后发布或退回修改" : "已提交复核，等待复核人员处理" });
  if (hasPermission(user, "batch:view") && reviewBatches.length) noticeItems.push({ view: "approval", title: `${reviewBatches.length}个计价批次正在复核`, detail: `${period}及历史期间 · 以批次台账为准` });
  if (pendingShares.length) noticeItems.push({ view: "allocation", title: `${pendingShares.length}条分润记录待确认`, detail: `${ROLE_DEFINITIONS[user.role].scopeLabel} · 请核对人员、比例与分润依据` });
  if (hasPermission(user, "validation:view")) noticeItems.push({ view: "validation", title: "5项高优先级历史公式问题待处理", detail: "涉及取数引用、重复计价和单价不一致" });

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>计</span></div>
          <div><strong>全产品计价系统</strong><small>员工绩效计价工作台</small></div>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航"><X size={20} /></button>
        </div>
        <div className="edition"><span>2026 计价年度</span><BadgeCheck size={15} /><b>V1.0</b></div>
        <nav className="main-nav" aria-label="主导航">
          <p className="nav-caption">计价工作台</p>
          {availableNav.map(({ id, icon: Icon }) => (
            <button key={id} className={activeView === id ? "active" : ""} onClick={() => go(id)} aria-current={activeView === id ? "page" : undefined}>
              <Icon size={19} strokeWidth={1.8} /><span>{navLabel(id, user)}</span>{activeView === id && <ChevronRight size={16} className="nav-arrow" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="integrity"><Database size={17} /><div><strong>业务数据保存在平台数据库</strong><span>{ROLE_DEFINITIONS[user.role].scopeLabel} · 操作记录按权限可查</span></div></div>
          <div className="user-card">
            <span className="avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name} · {ROLE_DEFINITIONS[user.role].shortLabel}</strong><small>{user.branch} · {ROLE_DEFINITIONS[user.role].scopeLabel}</small></span><button className="logout-button" onClick={() => logout.mutate()} disabled={logout.isPending} aria-label="退出登录" title="退出登录"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="关闭导航遮罩" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title"><button className="icon-button menu-trigger" onClick={() => setMobileOpen(true)} aria-label="打开导航"><Menu size={21} /></button><span>计价工作台</span><ChevronRight size={14} /><strong>{activeLabel}</strong></div>
          <div className="topbar-actions">
            <label className="period-select"><Clock3 size={16} /><span className="sr-only">计价期间</span><select value={period} onChange={(e) => setPeriod(e.target.value)}>{periodOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={14} /></label>
            <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="使用帮助"><CircleHelp size={19} /></button>
            <button className="icon-button notification-button" onClick={() => setNoticeOpen(true)} aria-label={`查看通知，${noticeItems.length}项`}><Bell size={19} />{noticeItems.length > 0 && <i />}</button>
          </div>
        </header>

        <div className="content-area">
          {activeView === "blueprint" ? <PlatformBlueprint onNavigate={go} allowedTargets={allowedTargets} /> : workspace.isLoading ? <LoadingState /> : workspace.error ? <ErrorState message={workspace.error.message} retry={() => workspace.refetch()} /> : (
            <>
              {activeView === "dashboard" && <WorkDashboard user={user} rules={activeRules} batches={workspace.data?.batches ?? []} shares={workspace.data?.shares ?? []} designs={designs} period={period} go={go} exportRules={() => exportRules(activeRules, notify)} />}
              {activeView === "rules" && <RuleCenter rules={activeRules} notify={notify} onDesign={openDesigner} canDesign={hasPermission(user, "design:manage")} />}
              {activeView === "designer" && (user.role === "reviewer" ? <DesignReviewCenter rules={rules} designs={designs} refresh={refresh} notify={notify} /> : <IndicatorDesigner key={designRule?.id ?? "designer"} rules={rules} designs={designs} initialRule={designRule} onInitialConsumed={() => setDesignRule(null)} refresh={refresh} notify={notify} />)}
              {activeView === "simulator" && <Simulator key={`simulator-${period}`} user={user} people={workspace.data?.people ?? []} rules={activeRules} period={period} refresh={refresh} notify={notify} canSave={hasPermission(user, "batch:save")} />}
              {activeView === "allocation" && <AllocationCenter user={user} people={workspace.data?.allocationPeople ?? []} rules={activeRules} shares={workspace.data?.shares ?? []} period={period} refresh={refresh} notify={notify} canManage={hasPermission(user, "allocation:manage")} />}
              {activeView === "validation" && <ValidationCenter notify={notify} />}
              {activeView === "approval" && <ApprovalCenter ruleCount={activeRules.length} batches={workspace.data?.batches ?? []} logs={workspace.data?.logs ?? []} period={period} refresh={refresh} notify={notify} canSubmit={hasPermission(user, "batch:submit")} canApprove={hasPermission(user, "batch:approve")} canViewLogs={hasPermission(user, "logs:view")} canSave={hasPermission(user, "batch:save")} />}
              {activeView === "accounts" && <AccountCenter currentUser={user} notify={notify} />}
            </>
          )}
        </div>
      </main>

      {helpOpen && <Modal title={`${ROLE_DEFINITIONS[user.role].label}使用指引`} onClose={() => setHelpOpen(false)} wide>
        <div className="help-grid">
          {helpItems.map((item, index) => <button key={item.title} onClick={() => { setHelpOpen(false); go(item.view); }}><b>{String(index + 1).padStart(2, "0")}</b><strong>{item.title}</strong><p>{item.text}</p></button>)}
        </div>
        <div className="notice-box"><Info size={18} /><p>当前人员与试算结果为演示数据。外部核心、人力资源和统一身份认证接口尚未连接，取数映射不代表自动取数。</p></div>
      </Modal>}
      {noticeOpen && <Modal title="待办与通知" onClose={() => setNoticeOpen(false)}>
        {noticeItems.length ? <div className="notice-list">{noticeItems.map((item) => <button key={`${item.view}-${item.title}`} onClick={() => { setNoticeOpen(false); go(item.view); }}><FileCheck2 size={18} /><span><strong>{item.title}</strong><small>{item.detail}</small></span><ChevronRight size={17} /></button>)}</div> : <div className="empty-inline"><CircleCheck size={25} /><p>当前没有待办事项。</p></div>}
      </Modal>}
      {toast && <div className={`toast ${toast.tone === "error" ? "error" : ""}`} role="status">{toast.tone === "error" ? <CircleAlert size={18} /> : <CircleCheck size={18} />}{toast.message}</div>}
    </div>
  );
}

function LoadingState() { return <div className="loading-state"><span className="loading-ring" /><strong>正在读取工作数据</strong><p>按当前岗位和机构范围加载规则、归属、批次与记录…</p></div>; }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="empty-state"><CircleAlert size={32} /><h2>暂时无法读取数据</h2><p>{message}</p><button className="button primary" onClick={retry}><RotateCcw size={17} />重新加载</button></div>; }

function PageHead({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="page-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-actions">{actions}</div>}</div>;
}

function RuleCenter({ rules, notify, onDesign, canDesign }: { rules: PricingRule[]; notify: (m: string, t?: Toast["tone"]) => void; onDesign: (rule?: PricingRule) => void; canDesign: boolean }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"全部" | Category>("全部");
  const [method, setMethod] = useState("全部");
  const filtered = rules.filter((r) => (category === "全部" || r.category === category) && (method === "全部" || r.method === method) && `${r.name}${r.group}${r.sourceCode ?? ""}${r.metricCode ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <>
    <PageHead eyebrow="2026年度 · 正式规则" title="计价规则" description={canDesign ? "查看现行单价、计算方式和取数关联。正式单价和公式调整须创建新版，经独立复核后生效。" : "查看当前启用的计价指标、单价、计算方式和取数关联。当前岗位为只读权限。"} actions={<><button className="button secondary" onClick={() => exportRules(filtered, notify)}><Download size={17} />导出当前清单</button>{canDesign && <button className="button primary" onClick={() => onDesign()}><Plus size={17} />设计新指标</button>}</>} />
    <div className="rule-summary"><span><BookOpen size={18} />2026年全员全产品计价指标表</span><b>{rules.length}项</b><i /><span>个金M码映射</span><b>{rules.filter((r) => r.sourceCode).length}项</b><i /><span>规则依据</span><b>年度指标表</b></div>
    <section className="panel table-panel">
      <div className="filter-bar"><label className="search-field"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索指标、分组或M码" /><kbd>{filtered.length}</kbd></label><div className="segmented">{(["全部", "利润", "规模", "客户"] as const).map((c) => <button className={category === c ? "active" : ""} key={c} onClick={() => setCategory(c)}>{c}</button>)}</div><label className="select-wrap"><ListFilter size={16} /><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="全部">全部算法</option>{Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <div className="table-scroll"><table className="data-table rules-table"><thead><tr><th>指标名称</th><th>分类 / 分组</th><th>计价方式</th><th>存量 / 总量</th><th>正增长</th><th>负增长</th><th>取数关联</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{filtered.map((rule) => <tr key={rule.id}><td><strong>{rule.name}</strong><small>{rule.id} · {rule.unit}</small></td><td><span className={`category-tag ${rule.category}`}>{rule.category}</span><small>{rule.group}</small></td><td><span>{METHOD_LABELS[rule.method]}</span></td><td className="number">{rate(rule.stockRate)}</td><td className="number positive">{rate(rule.positiveRate)}</td><td className="number negative">{rate(rule.negativeRate)}</td><td>{rule.sourceCode ? <><code>{rule.metricCode}</code><small>→ {rule.sourceCode}</small></> : <span className="muted">待配置映射</span>}</td><td><div className="design-row-actions">{canDesign ? <button className="text-button" onClick={() => onDesign(rule)} aria-label={`基于${rule.name}创建新版`}><SquarePen size={14} />创建新版</button> : <span className="small-muted">只读</span>}</div></td></tr>)}</tbody></table></div>
      {filtered.length === 0 && <div className="empty-inline"><Search size={24} /><p>没有匹配的规则，请调整筛选条件。</p><button className="text-button" onClick={() => { setQuery(""); setCategory("全部"); setMethod("全部"); }}>清空筛选</button></div>}
      <div className="table-footer"><span>显示 {filtered.length} / {rules.length} 项</span><span>“—”表示年度标准未设置该单价</span></div>
    </section>
  </>;
}

function rate(v: number | null) { return v === null ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: 2 }); }

function Simulator({ user, people, rules, period, refresh, notify, canSave }: { user: AccessUser; people: Array<{ id: string; name: string; branch: string; role: string }>; rules: PricingRule[]; period: string; refresh: () => void; notify: (m: string, t?: Toast["tone"]) => void; canSave: boolean }) {
  const [ruleId, setRuleId] = useState("S005");
  const [employee, setEmployee] = useState(user.employeeId);
  const [input, setInput] = useState<CalcInput>({ month: Number(period.split("-")[1]), directValue: 128, opening: 8600, current: 9320, previous: 9150, cap: null, floor: null });
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const selectedEmployee = people.some((person) => person.id === employee) ? employee : people[0]?.id ?? employee;
  const signature = JSON.stringify({ ruleId, employee: selectedEmployee, input, period });
  const saved = savedSignature === signature;
  const rule = rules.find((r) => r.id === ruleId) ?? rules[0];
  const result = rule ? calculate(rule, input) : null;
  const saveMutation = trpc.pricing.saveBatch.useMutation({
    onSuccess: (_data, variables) => {
      const item = variables.snapshot[0];
      setSavedSignature(JSON.stringify({ ruleId: item.ruleId, employee: item.employeeId, input: item.input, period: variables.period }));
      refresh();
      notify("试算批次已保存为草稿，可前往批次管理提交复核");
    },
    onError: (e) => notify(e.message, "error"),
  });
  const person = people.find((item) => item.id === selectedEmployee) ?? people[0];
  if (!rule || !result || !person) return <div className="empty-state"><Calculator size={30} /><p>暂无可用规则或计价人员</p></div>;
  const update = (key: keyof CalcInput, value: string) => setInput((v) => ({ ...v, [key]: value === "" && (key === "cap" || key === "floor") ? null : Number(value) }));
  const preset = (kind: "positive" | "negative" | "zero") => {
    if (kind === "positive") setInput({ ...input, directValue: 128, opening: 8600, current: 9320, previous: 9150 });
    if (kind === "negative") setInput({ ...input, directValue: -42, opening: 8600, current: 8300, previous: 8420 });
    if (kind === "zero") setInput({ ...input, directValue: 0, opening: 8600, current: 8600, previous: 8600 });
  };
  return <>
    <PageHead eyebrow={`${period} · ${ROLE_DEFINITIONS[user.role].scopeLabel}`} title="计价试算" description="选择人员、产品和期间，录入业务数据并核对计算过程。保存正式批次时，服务端会按当前规则重新计算。" actions={<button className="button secondary" onClick={() => setInput({ month: Number(period.split("-")[1]), directValue: 128, opening: 8600, current: 9320, previous: 9150, cap: null, floor: null })}><RotateCcw size={17} />重置输入</button>} />
    <div className="simulator-layout">
      <section className="panel simulator-form">
        <div className="step-title"><span>01</span><div><h2>选择计价对象</h2><p>人员、期间与产品规则</p></div></div>
        <div className="form-grid two"><label>计价人员<select value={selectedEmployee} onChange={(e) => setEmployee(e.target.value)}>{people.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.branch} · {e.role}</option>)}</select></label><label>计价月份<input type="month" value={period} readOnly /></label></div>
        <label className="field">计价产品<select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>{rules.map((r) => <option key={r.id} value={r.id}>{r.category}｜{r.name}（{r.id}）</option>)}</select></label>
        <div className="selected-rule"><span className={`category-tag ${rule.category}`}>{rule.category}</span><strong>{METHOD_LABELS[rule.method]}</strong><small>{rule.unit} · {rule.sourceCode ?? "取数映射待配置"}</small></div>
        <div className="step-title second"><span>02</span><div><h2>录入业务数据</h2><p>{rule.definition ? `业务值单位：${rule.definition.sourceUnit}；公式换算除数 ${rule.definition.unitFactor}` : "金额单位：万元；户数/笔数按实际数量"}</p></div></div>
        <div className="scenario-buttons"><span>快速场景</span><button onClick={() => preset("positive")}>正向增长</button><button onClick={() => preset("negative")}>负向扣减</button><button onClick={() => preset("zero")}>零值边界</button></div>
        {(rule.method === "direct") ? <label className="field">当月新增 / 当月业务值<input type="number" step="0.01" value={input.directValue} onChange={(e) => update("directValue", e.target.value)} /></label> : <>{rule.method === "custom" && <label className="field">当月新增 / 当月业务值<input type="number" step="0.01" value={input.directValue} onChange={(e) => update("directValue", e.target.value)} /></label>}<div className="form-grid three"><label>年初值<input type="number" step="0.01" value={input.opening} onChange={(e) => update("opening", e.target.value)} /></label><label>当月值<input type="number" step="0.01" value={input.current} onChange={(e) => update("current", e.target.value)} /></label><label>上月值<input type="number" step="0.01" value={input.previous} onChange={(e) => update("previous", e.target.value)} /></label></div></>}
        <div className="form-grid two optional-fields"><label>积分封顶（可选）<input type="number" step="0.01" value={input.cap ?? ""} onChange={(e) => update("cap", e.target.value)} placeholder="不封顶" /></label><label>积分保底（可选）<input type="number" step="0.01" value={input.floor ?? ""} onChange={(e) => update("floor", e.target.value)} placeholder="不保底" /></label></div>
        <div className="month-progress"><label>时间进度参数 <b>n = {input.month}</b></label><input aria-label="时间进度月份" type="range" min="1" max="12" value={input.month} onChange={(e) => update("month", e.target.value)} /><div><span>1月</span><span>自动带入 n 与 n−1</span><span>12月</span></div></div>
      </section>
      <section className="result-column">
        <div className={`result-sheet ${result.direction === "扣减" ? "deduct" : ""}`}>
          <div className="result-top"><span>本次计价结果</span><span className="status-badge">{result.direction}</span></div>
          <strong className="result-score">{result.score.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}<small>积分</small></strong>
          <p>{person.name} · {rule.name}</p>
          <div className="formula-box"><span>计算过程</span><code>{result.expression}</code><div><span>计价基数 <b>{Number(result.base.toFixed(4)).toLocaleString("zh-CN")}</b></span><span>适用单价 <b>{result.rate}</b></span></div></div>
          <div className="result-meta"><span><Check size={15} />零值显式处理</span><span><Check size={15} />保留两位小数</span><span><Check size={15} />规则版本V{rule.version ?? 1}</span></div>
        </div>
        <div className="result-actions">{canSave && <button className="button primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ period, title: `${period} ${person.name}计价试算`, totalScore: result.score, employeeCount: 1, snapshot: [{ employee: person.name, employeeId: person.id, ruleId: rule.id, ruleName: rule.name, ruleVersion: rule.version ?? 1, ruleDefinition: rule.definition ?? null, input, score: result.score, expression: result.expression }] })}>{saveMutation.isPending ? "保存中…" : saved ? "已保存草稿" : "保存为试算批次"}{saved ? <Check size={17} /> : <FileCheck2 size={17} />}</button>}<button className="button secondary" onClick={() => { exportCsv("计价试算明细.csv", ["期间", "员工", "产品", "算法", "计算过程", "积分"], [[period, person.name, rule.name, METHOD_LABELS[rule.method], result.expression, result.score]]); notify("试算明细已导出"); }}><Download size={17} />导出明细</button></div>
        <div className="notice-box"><Info size={17} /><p>{canSave ? "保存后生成草稿批次，仍需提交复核并由独立复核人员审批锁定。浏览器结果不能替代服务端复算。" : "本次试算仅用于核对计算过程，不生成正式批次，也不会自动计入业绩。"}</p></div>
      </section>
    </div>
  </>;
}

type AllocationRecord = {
  id: number;
  employeeName: string;
  employeeId: string;
  branch: string;
  ruleId: string;
  ratio: number;
  reason: string;
  status: string;
  period: string;
  confirmedAt: Date | null;
};

type AllocationCenterProps = {
  user: AccessUser;
  people: Array<{ id: string; name: string; branch: string; role: string }>;
  rules: PricingRule[];
  shares: AllocationRecord[];
  period: string;
  refresh: () => void;
  notify: (m: string, t?: Toast["tone"]) => void;
  canManage: boolean;
};

function AllocationCenter({ user, people, rules, shares, period, refresh, notify, canManage }: AllocationCenterProps) {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const selectedShare = shares.find((share) => share.id === confirmId && share.period === period) ?? null;
  const confirmMutation = trpc.pricing.confirmAllocation.useMutation({
    onSuccess: () => { setConfirmId(null); refresh(); notify("本人分润归属已确认，确认时间已写入记录"); },
  });
  const grouped = useMemo(() => {
    const map = new Map<string, AllocationRecord[]>();
    shares.filter((share) => share.period === period).forEach((share) => {
      const key = `${share.period}-${share.ruleId}`;
      map.set(key, [...(map.get(key) ?? []), share]);
    });
    return [...map.entries()];
  }, [shares, period]);

  const openConfirmation = (id: number) => {
    confirmMutation.reset();
    setConfirmId(id);
  };

  return <>
    <PageHead eyebrow={`${period} · ${ROLE_DEFINITIONS[user.role].scopeLabel}`} title="业绩归属与分润" description={canManage ? "登记协同人员和分润比例，并由各参与人确认本人记录。系统核对人员机构和比例合计。" : "查看并确认本人分润记录、所属机构和比例；不能修改分润或代替他人确认。"} actions={canManage ? <button className="button primary" onClick={() => setOpen(true)}><Plus size={17} />新增分润</button> : undefined} />
    <section className="allocation-principles"><div><Users size={21} /><strong>人员与比例</strong><p>同一期间、同一产品的分润比例合计不得超过100%</p></div><div><Building2 size={21} /><strong>机构范围</strong><p>负责人限本机构，客户经理登记本人参与的本机构协作</p></div><div><Network size={21} /><strong>本人确认</strong><p>员工核对并确认本人记录，确认人和时间留痕</p></div></section>
    <section className="panel table-panel"><div className="panel-head padded"><div><h2>分润方案</h2><p>{period} · {canManage ? "可新增协同业务，本人记录可确认" : "本人记录可确认，其他记录只读"}</p></div><span className="status-badge success"><Check size={13} />比例自动校验</span></div>
      {grouped.length === 0 ? <div className="empty-state"><GitBranch size={30} /><h3>本期暂无分润记录</h3><p>{canManage ? "可新增一笔协同业务，明确人员、比例与原因。" : `${period} 在当前权限范围内没有可查看的记录。`}</p></div> : <div className="allocation-groups">{grouped.map(([key, rows]) => {
        const total = rows.reduce((sum, share) => sum + share.ratio, 0);
        const rule = rules.find((item) => item.id === rows[0].ruleId);
        return <div className="allocation-group" key={key}>
          <div className="allocation-group-head"><div><span>{rows[0].period}</span><strong>{rule?.name ?? rows[0].ruleId}</strong></div><span className={`status-badge ${Math.abs(total - 100) < 0.001 ? "success" : "warning"}`}>合计 {total}%</span></div>
          {rows.map((share) => <div className="share-row" key={share.id}>
            <span className="avatar small">{share.employeeName.slice(0, 1)}</span>
            <div><strong>{share.employeeName}<small>{share.employeeId}</small></strong><p>{share.branch} · {share.reason}</p></div>
            <div className="ratio-visual"><span><i style={{ width: `${share.ratio}%` }} /></span><b>{share.ratio}%</b></div>
            {share.status === "approved" ? <span className="status-badge success" title={share.confirmedAt ? `确认于 ${new Date(share.confirmedAt).toLocaleString("zh-CN", { hour12: false })}` : "历史已确认记录"}>已确认</span> : share.employeeId === user.employeeId ? <button className="button secondary share-confirm-button" onClick={() => openConfirmation(share.id)}>确认无误</button> : <span className="status-badge warning" title="仅记录归属人本人可确认">待本人确认</span>}
          </div>)}
        </div>;
      })}</div>}
    </section>
    {canManage && open && <AllocationForm people={people} rules={rules} period={period} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refresh(); notify("分润记录已保存，操作人已写入记录"); }} />}
    {selectedShare && <Modal title="确认本人分润" onClose={() => setConfirmId(null)}>
      <p>请核对以下归属信息。确认仅表示本人认可本次产品分润比例和依据，不代表薪酬审批或结果发布。</p>
      <dl className="allocation-confirm-detail">
        <div><dt>所属期间</dt><dd>{selectedShare.period}</dd></div>
        <div><dt>计价产品</dt><dd>{rules.find((rule) => rule.id === selectedShare.ruleId)?.name ?? selectedShare.ruleId}</dd></div>
        <div><dt>归属人员</dt><dd>{selectedShare.employeeName} · {selectedShare.employeeId} · {selectedShare.branch}</dd></div>
        <div><dt>分润比例</dt><dd><strong>{selectedShare.ratio}%</strong></dd></div>
        <div><dt>分润依据</dt><dd>{selectedShare.reason}</dd></div>
      </dl>
      {confirmMutation.error && <p className="form-error" role="alert"><CircleAlert size={15} />{confirmMutation.error.message}</p>}
      <div className="modal-actions"><button className="button secondary" onClick={() => setConfirmId(null)} disabled={confirmMutation.isPending}>再核对一下</button><button className="button primary" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate({ id: selectedShare.id })}>{confirmMutation.isPending ? "正在确认…" : "确认本人分润"}<Check size={16} /></button></div>
    </Modal>}
  </>;
}

function AllocationForm({ people, rules, period, onClose, onSaved }: { people: Array<{ id: string; name: string; branch: string; role: string }>; rules: PricingRule[]; period: string; onClose: () => void; onSaved: () => void }) {
  const [person, setPerson] = useState(people[0]?.id ?? "");
  const [ruleId, setRuleId] = useState(rules.find((rule) => rule.id !== "P015")?.id ?? rules[0]?.id ?? "");
  const [ratio, setRatio] = useState("60");
  const [reason, setReason] = useState("");
  const mutation = trpc.pricing.createAllocation.useMutation({ onSuccess: onSaved });
  const employee = people.find((item) => item.id === person) ?? people[0];
  const valid = Boolean(employee) && Boolean(ruleId) && Number(ratio) > 0 && Number(ratio) <= 100 && reason.trim().length >= 4;
  return <Modal title="新增协同分润" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); if (valid && employee) mutation.mutate({ employeeId: employee.id, employeeName: employee.name, branch: employee.branch, ruleId, period, ratio: Number(ratio), reason }); }}>
    <label className="field">协同人员<select value={person} onChange={(e) => setPerson(e.target.value)}>{people.map((e) => <option value={e.id} key={e.id}>{e.name} · {e.branch} · {e.role}</option>)}</select></label>
    <label className="field">计价产品<select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>{rules.map((r) => <option value={r.id} key={r.id}>{r.name}</option>)}</select></label>
    <div className="form-grid two"><label>所属期间<input value={period} readOnly /></label><label>分润比例（%）<input type="number" min="0.01" max="100" step="0.01" value={ratio} onChange={(e) => setRatio(e.target.value)} /></label></div>
    <label className="field">分润依据<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：客户主办，负责方案设计与持续服务" /></label>
    {mutation.error && <p className="form-error"><CircleAlert size={15} />{mutation.error.message}</p>}
    <div className="notice-box"><Info size={17} /><p>请为同一期间、同一产品的参与人分别新增记录。系统按产品汇总比例，超过100%会阻止保存；人员姓名和机构以服务端目录为准。</p></div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!valid || mutation.isPending}>{mutation.isPending ? "保存中…" : "保存分润"}<Check size={17} /></button></div>
  </form></Modal>;
}

function ValidationCenter({ notify }: { notify: (m: string, t?: Toast["tone"]) => void }) {
  const [level, setLevel] = useState("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof ANOMALIES)[number] | null>(null);
  const rows = ANOMALIES.filter((a) => (level === "全部" || a.level === level) && `${a.object}${a.type}${a.detail}`.includes(query));
  return <>
    <PageHead eyebrow="质量控制 · 历史公式核查" title="逐项核查，明确整改。" description="汇总已发现的历史公式问题，按严重度核对单价、单位、月份、取数引用和重复计价风险；整改情况以实际处理记录为准。" actions={<button className="button secondary" onClick={() => { exportCsv("计价异常核查清单.csv", ["编号", "严重度", "类型", "指标", "问题", "建议", "状态"], rows.map((a) => [a.id, a.level, a.type, a.object, a.detail, a.suggestion, a.status])); notify("异常核查清单已导出"); }}><Download size={17} />导出核查清单</button>} />
    <section className="audit-summary"><div className="audit-score"><span>历史公式核查记录</span><strong>8<small>项</small></strong><p>5项高严重度、2项中严重度，另有1项零值防护已纳入现行计算规则。</p></div><div className="audit-counts"><button className={level === "高" ? "active" : ""} onClick={() => setLevel(level === "高" ? "全部" : "高")}><span>高严重度</span><strong>5</strong><small>断链 / 单价 / 重复计价</small></button><button className={level === "中" ? "active" : ""} onClick={() => setLevel(level === "中" ? "全部" : "中")}><span>中严重度</span><strong>2</strong><small>月份参数 / 指标缺失</small></button><button className={level === "低" ? "active" : ""} onClick={() => setLevel(level === "低" ? "全部" : "低")}><span>已内建防护</span><strong>1</strong><small>零值分支</small></button></div></section>
    <section className="panel table-panel"><div className="filter-bar"><label className="search-field"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索异常指标或类型" /><kbd>{rows.length}</kbd></label><div className="segmented">{["全部", "高", "中", "低"].map((l) => <button key={l} className={level === l ? "active" : ""} onClick={() => setLevel(l)}>{l === "全部" ? "全部" : `${l}严重度`}</button>)}</div></div>
      <div className="audit-list">{rows.map((a) => <button className="audit-row" key={a.id} onClick={() => setSelected(a)}><span className={`severity s${a.level}`}>{a.level}</span><div><strong>{a.type} · {a.object}</strong><p>{a.detail}</p></div><span className="audit-status">{a.status}</span><Eye size={17} /></button>)}</div>
      {rows.length === 0 && <div className="empty-inline"><CircleCheck size={24} /><p>当前筛选下没有异常。</p></div>}
    </section>
    <section className="panel lineage-panel"><div className="panel-head"><div><h2>取数到积分的核对顺序</h2><p>用于核对科目、单位、指标与积分关联，不代表已连接源系统自动取数</p></div></div><div className="lineage-flow">{[["源系统科目", "_p950332f", "元 / 原始值"], ["单位转换", "÷ 10,000", "统一转万元"], ["当月指标", "M9992090", "理财销售收入"], ["计价规则", "× 300", "2026年V1.0"], ["当月积分", "M9991812", "结果可追溯"]].map(([t, c, d], i) => <div key={t}><span>{i + 1}</span><strong>{t}</strong><code>{c}</code><small>{d}</small>{i < 4 && <ChevronRight size={18} />}</div>)}</div></section>
    {selected && <Modal title={`${selected.id} · ${selected.type}`} onClose={() => setSelected(null)}><div className="anomaly-detail"><span className={`severity s${selected.level}`}>{selected.level}严重度</span><h3>{selected.object}</h3><dl><div><dt>发现的问题</dt><dd>{selected.detail}</dd></div><div><dt>整改建议</dt><dd>{selected.suggestion}</dd></div><div><dt>当前状态</dt><dd>{selected.status}</dd></div></dl><div className="notice-box"><Info size={17} /><p>此处展示历史公式的核查结果和整改建议；现行规则通过明确的取数关联、参数和分支处理减少同类问题。</p></div><button className="button primary full" onClick={() => { exportCsv(`${selected.id}-${selected.object}.csv`, ["字段", "内容"], [["指标", selected.object], ["问题", selected.detail], ["建议", selected.suggestion]]); notify("单项整改卡已导出"); }}><Download size={17} />导出整改卡</button></div></Modal>}
  </>;
}

type ApprovalCenterProps = {
  ruleCount: number;
  batches: BatchRecord[];
  logs: Array<{ id: number; action: string; actor: string; objectType: string; objectId: string; detail: string; createdAt: Date }>;
  period: string;
  refresh: () => void;
  notify: (m: string, t?: Toast["tone"]) => void;
  canSubmit: boolean;
  canApprove: boolean;
  canViewLogs: boolean;
  canSave: boolean;
};

function ApprovalCenter({ ruleCount, batches, logs, period, refresh, notify, canSubmit, canApprove, canViewLogs, canSave }: ApprovalCenterProps) {
  const [tab, setTab] = useState<"batches" | "logs">("batches");
  const [detailId, setDetailId] = useState<number | null>(null);
  const visibleBatches = batches.filter((batch) => batch.period === period);
  const selectedBatch = visibleBatches.find((batch) => batch.id === detailId) ?? null;
  const submit = trpc.pricing.submitBatch.useMutation({
    onSuccess: () => { refresh(); notify("批次已提交复核，等待独立复核人员办理"); },
    onError: (error) => notify(error.message, "error"),
  });
  const statusText: Record<string, string> = { draft: "草稿", review: "复核中", locked: "已锁定" };

  const exportBatches = () => {
    exportCsv(`${period}计价批次台账.csv`, ["批次号", "名称", "期间", "人数", "总积分", "状态"], visibleBatches.map((batch) => [batch.id, batch.title, batch.period, batch.employeeCount, batch.totalScore, statusText[batch.status] ?? batch.status]));
    notify(`已导出${period}的${visibleBatches.length}个批次`);
  };

  return <>
    <PageHead
      eyebrow={`${period} · 批次办理`}
      title="批次复核与记录"
      description={canApprove ? "逐条核对业务输入、计算过程和规则快照，可填写原因退回或审批锁定。提交与审批分离。" : canSubmit ? "查看批次明细和退回原因，修改后重新提交，由独立复核人员审批锁定。" : "查看权限范围内的批次明细、结果和操作记录。当前岗位为只读权限。"}
      actions={<button className="button secondary" onClick={exportBatches}><Download size={17} />导出台账</button>}
    />
    <div className="version-banner"><div><LockKeyhole size={24} /><span><strong>2026年计价规则</strong><small>{ruleCount}项正式指标 · 历史批次保留当时的规则与结果记录</small></span></div><span className="status-badge success"><CircleCheck size={14} />当前年度</span></div>
    <div className="tab-bar">
      <button className={tab === "batches" ? "active" : ""} onClick={() => setTab("batches")}><Layers3 size={17} />计价批次<span>{visibleBatches.length}</span></button>
      {canViewLogs && <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}><BookOpen size={17} />操作日志<span>{logs.length}</span></button>}
    </div>
    {tab === "batches" ? <section className="batch-list">
      {visibleBatches.length === 0 && <div className="empty-state"><Layers3 size={30} /><h3>本期暂无计价批次</h3><p>{period} 在当前权限范围内没有可查看的批次记录。</p></div>}
      {visibleBatches.map((batch) => <article className="batch-card" key={batch.id}>
        <div className="batch-id"><span>批次</span><strong>#{String(batch.id).padStart(5, "0")}</strong></div>
        <div className="batch-info">
          <div><h2>{batch.title}</h2><span className={`status-badge ${batch.status === "locked" ? "success" : batch.status === "review" ? "warning" : ""}`}>{batch.status === "locked" && <LockKeyhole size={12} />}{statusText[batch.status] ?? batch.status}</span></div>
          <p>{batch.period} · {batch.employeeCount}名计价人员 · {batch.createdByName ? `创建人 ${batch.createdByName} · ` : ""}创建于 {new Date(batch.createdAt).toLocaleDateString("zh-CN")}</p>
          {batch.returnReason && batch.status === "draft" && <p className="batch-return-inline">最近退回：{batch.returnReason}</p>}
        </div>
        <div className="batch-score"><span>合计积分</span><strong>{batch.totalScore.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</strong></div>
        <div className="batch-actions">
          <button className="button secondary" onClick={() => setDetailId(batch.id)}><Eye size={16} />查看明细</button>
          {batch.status === "draft" && canSubmit && <button className="button primary" disabled={submit.isPending} onClick={() => submit.mutate({ id: batch.id })}><Send size={16} />{batch.returnReason ? "重新提交" : "提交复核"}</button>}
          {batch.status === "review" && canApprove && <button className="button primary" onClick={() => setDetailId(batch.id)}><BadgeCheck size={16} />进入复核</button>}
          {((batch.status === "draft" && !canSubmit) || (batch.status === "review" && !canApprove)) && <span className="small-muted">{batch.status === "review" ? "等待复核人员办理" : "草稿只读"}</span>}
        </div>
      </article>)}
    </section> : <section className="panel log-panel"><div className="log-timeline">{logs.map((log) => <div className="log-row" key={log.id}><span className="log-dot" /><div><strong>{log.action}<small>{log.objectType} · {log.objectId}</small></strong><p>{log.detail}</p></div><div><span>{log.actor}</span><time>{new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}</time></div></div>)}</div></section>}
    {selectedBatch && <BatchDetailModal batch={selectedBatch} canApprove={canApprove} canEdit={canSave} refresh={refresh} notify={notify} onClose={() => setDetailId(null)} />}
  </>;
}

function exportRules(rules: PricingRule[], notify: (m: string, t?: Toast["tone"]) => void) {
  exportCsv("2026年全员全产品计价规则.csv", ["规则ID", "指标名称", "类别", "分组", "单位", "计算方式", "存量总量", "正增长", "负增长", "取数M码", "积分M码"], rules.map((r) => [r.id, r.name, r.category, r.group, r.unit, METHOD_LABELS[r.method], r.stockRate ?? "", r.positiveRate ?? "", r.negativeRate ?? "", r.metricCode ?? "", r.sourceCode ?? ""]));
  notify(`已导出${rules.length}项计价规则`);
}

function App() {
  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  if (me.isLoading) return <main className="auth-loading"><span className="loading-ring" /><strong>正在检查登录状态</strong></main>;
  if (me.error) return <main className="auth-loading"><CircleAlert size={32} /><strong>暂时无法检查登录状态</strong><p>{me.error.message}</p><button className="button primary" onClick={() => me.refetch()}>重新连接</button></main>;
  if (!me.data) return <LoginPage onSuccess={(user) => { utils.auth.me.setData(undefined, user); }} />;
  return <WorkspaceApp user={me.data} onLogout={() => {
    queryClient.removeQueries({ queryKey: getQueryKey(trpc.pricing.workspace) });
    queryClient.removeQueries({ queryKey: getQueryKey(trpc.auth.listUsers) });
    utils.auth.me.setData(undefined, null);
  }} />;
}

export default App;
