import { BookOpen, Calculator, Check, ChevronRight, CircleCheck, Clock3, Download, FileCheck2, GitBranch, Layers3, SquarePen, UserCog, Users } from "lucide-react";
import { hasPermission, ROLE_DEFINITIONS, type AccessUser } from "@contracts/access";
import type { Category, IndicatorDesignRecord, PricingRule } from "@contracts/pricing";

type WorkView = "rules" | "simulator" | "allocation" | "designer" | "approval" | "accounts";
type Batch = { id: number; title: string; period: string; totalScore: number; employeeCount: number; status: string; createdAt: Date };
type Share = { id: number; employeeName: string; employeeId: string; branch: string; ruleId: string; ratio: number; reason: string; status: string; period: string };
type Props = {
  user: AccessUser;
  rules: PricingRule[];
  batches: Batch[];
  shares: Share[];
  designs: IndicatorDesignRecord[];
  period: string;
  go: (view: WorkView) => void;
  exportRules: () => void;
};

const statusText: Record<string, string> = { draft: "草稿", review: "复核中", locked: "已锁定" };
const scoreText = (value: number) => value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function WorkDashboard({ user, rules, batches, shares, designs, period, go, exportRules }: Props) {
  const self = user.scope === "self";
  const currentBatches = batches.filter((batch) => batch.period === period);
  const currentShares = shares.filter((share) => share.period === period);
  const totalScore = currentBatches.filter((batch) => batch.status === "locked").reduce((sum, batch) => sum + batch.totalScore, 0);
  const reviewCount = currentBatches.filter((batch) => batch.status === "review").length;
  const lockedCount = currentBatches.filter((batch) => batch.status === "locked").length;
  const draftCount = currentBatches.filter((batch) => batch.status === "draft").length;
  const pendingShares = currentShares.filter((share) => share.status !== "approved").length;
  const pendingDesigns = designs.filter((design) => design.status === "review").length;
  const categoryStats = (["利润", "规模", "客户"] as Category[]).map((category) => ({ category, count: rules.filter((rule) => rule.category === category).length }));
  const title = self ? "我的计价工作" : user.scope === "branch" ? `${user.branch}计价工作` : "全行计价工作";
  const description = self
    ? "查看本人分润、核对正式规则并进行个人试算；试算结果不会自动计入正式业绩。"
    : user.scope === "branch"
      ? "办理本机构试算、分润和批次提交；跨机构数据与独立复核操作不在当前权限内。"
      : user.role === "reviewer"
        ? "查看全行待复核批次和指标，按职责完成独立复核与审批。"
        : "查看全行规则、批次与办理进度；具体数据以当前期间台账为准。";
  const quickLinks = [
    { view: "simulator" as const, label: self ? "本人计价试算" : "发起计价试算", detail: "录入业务数据并核对计算过程", icon: Calculator, show: true },
    { view: "allocation" as const, label: self ? "查看我的分润" : "核对业绩归属", detail: "人员、机构、比例与确认状态", icon: GitBranch, show: true },
    { view: "designer" as const, label: user.role === "reviewer" ? "办理指标复核" : "设计计价指标", detail: user.role === "reviewer" ? "独立复测、退回或发布" : "定义、单价、公式与考核细则", icon: SquarePen, show: hasPermission(user, "design:view") },
    { view: "approval" as const, label: user.role === "reviewer" ? "办理批次审批" : "查看计价批次", detail: "草稿、复核与锁定记录", icon: Layers3, show: hasPermission(user, "batch:view") },
    { view: "accounts" as const, label: "管理账号权限", detail: "新增账号、调整角色与停用", icon: UserCog, show: hasPermission(user, "accounts:manage") },
  ].filter((item) => item.show).slice(0, 4);

  return (
    <>
      <div className="page-head"><div><span className="eyebrow">{period} · {user.branch} · {ROLE_DEFINITIONS[user.role].scopeLabel}</span><h1>{title}</h1><p>{description}</p></div><div className="page-actions"><button className="button secondary" onClick={exportRules}><Download size={17} />导出正式规则</button><button className="button primary" onClick={() => go("simulator")}><Calculator size={17} />{self ? "本人试算" : "发起试算"}</button></div></div>

      <section className="hero-ledger">
        <div className="ledger-main"><span>{self ? "本期本人分润记录" : "本期已锁定积分"}</span><strong>{self ? currentShares.length : scoreText(totalScore)}<small>{self ? " 条" : " 积分"}</small></strong><div className="ledger-delta">{self ? <><GitBranch size={16} />涉及 {new Set(currentShares.map((share) => share.ruleId)).size} 项产品 <i /> {pendingShares} 条待确认</> : <><FileCheck2 size={16} />{currentBatches.length} 个批次 <i /> {currentBatches.reduce((sum, batch) => sum + batch.employeeCount, 0)} 计价人次</>}</div></div>
        <div className="ledger-side"><span>{self ? "当前可用正式规则" : "当前等待复核"}</span><strong>{self ? <BookOpen size={20} /> : <Clock3 size={20} />}{self ? `${rules.length} 项` : `${reviewCount} 个批次`}</strong><p>{self ? "仅显示已启用的2026年度规则" : `另有 ${draftCount} 个草稿、${lockedCount} 个已锁定批次`}</p><button onClick={() => go(self ? "rules" : hasPermission(user, "batch:view") ? "approval" : "rules")}>{self ? "查看规则" : hasPermission(user, "batch:view") ? "查看批次" : "查看规则"}<ChevronRight size={16} /></button></div>
        <div className="ledger-watermark" aria-hidden="true">2026<br />PRICING</div>
      </section>

      <section className="metric-strip">
        {self ? <>
          <div><span><GitBranch size={17} />本人分润</span><strong>{currentShares.length}<small>条</small></strong><small>当前期间记录</small></div>
          <div><span><Layers3 size={17} />涉及产品</span><strong>{new Set(currentShares.map((share) => share.ruleId)).size}<small>项</small></strong><small>按产品编码去重</small></div>
          <div className={pendingShares ? "warning-metric" : ""}><span><Clock3 size={17} />待确认分润</span><strong>{pendingShares}<small>条</small></strong><small>{pendingShares ? "请核对归属比例" : "当前均已确认"}</small></div>
          <div><span><BookOpen size={17} />正式规则</span><strong>{rules.length}<small>项</small></strong><small>可用于本人试算</small></div>
        </> : <>
          <div><span><Clock3 size={17} />复核中批次</span><strong>{reviewCount}<small>个</small></strong><small>{user.role === "reviewer" ? "需要独立复核" : "等待复核人员办理"}</small></div>
          <div><span><CircleCheck size={17} />已锁定批次</span><strong>{lockedCount}<small>个</small></strong><small>保留当时结果与版本</small></div>
          <div><span><FileCheck2 size={17} />草稿批次</span><strong>{draftCount}<small>个</small></strong><small>尚未提交复核</small></div>
          <div className={hasPermission(user, "design:view") && pendingDesigns ? "warning-metric" : ""}><span>{hasPermission(user, "design:view") ? <SquarePen size={17} /> : <BookOpen size={17} />}{hasPermission(user, "design:view") ? "待复核指标" : "正式规则"}</span><strong>{hasPermission(user, "design:view") ? pendingDesigns : rules.length}<small>项</small></strong><small>{hasPermission(user, "design:view") ? "当前设计流程" : "当前启用"}</small></div>
        </>}
      </section>

      <div className="dashboard-grid">
        <section className="panel performance-panel"><div className="panel-head"><div><h2>{self ? "我的分润记录" : "本期计价批次"}</h2><p>{period} · {ROLE_DEFINITIONS[user.role].scopeLabel}</p></div><button className="text-button" onClick={() => go(self ? "allocation" : hasPermission(user, "batch:view") ? "approval" : "rules")}>查看全部<ChevronRight size={15} /></button></div>
          {self ? <WorkListShares shares={currentShares} rules={rules} /> : <WorkListBatches batches={currentBatches} />}
        </section>
        <section className="panel coverage-panel"><div className="panel-head"><div><h2>正式指标构成</h2><p>2026年度已启用规则</p></div><span className="status-badge success"><Check size={13} />{rules.length}项</span></div><div className="coverage-ring" style={{ "--p1": `${(categoryStats[0].count / Math.max(rules.length, 1)) * 360}deg`, "--p2": `${((categoryStats[0].count + categoryStats[1].count) / Math.max(rules.length, 1)) * 360}deg` } as React.CSSProperties}><div><strong>{rules.length}</strong><span>计价指标</span></div></div><div className="coverage-legend">{categoryStats.map((stat, index) => <button key={stat.category} onClick={() => go("rules")}><i className={`c${index}`} /><span>{stat.category}类</span><strong>{stat.count}项</strong><ChevronRight size={14} /></button>)}</div></section>
      </div>

      <div className="dashboard-grid lower">
        {!self && <section className="panel process-panel"><div className="panel-head"><div><h2>本期办理进度</h2><p>按当前批次实际状态展示</p></div><span className="small-muted">{currentBatches.length} 个批次</span></div><div className="process-line">{[
          { title: "规则准备", detail: `${rules.length}项正式规则`, done: rules.length > 0 },
          { title: "试算保存", detail: currentBatches.length ? "已有批次" : "尚未开始", done: currentBatches.length > 0 },
          { title: "复核审批", detail: reviewCount ? `${reviewCount}个待办` : "当前无待办", done: reviewCount > 0 || lockedCount > 0 },
          { title: "锁定完成", detail: lockedCount ? `${lockedCount}个已锁定` : "尚未锁定", done: lockedCount > 0 },
        ].map((item, index) => <div className={item.done ? "done" : ""} key={item.title}><span>{item.done ? <Check size={15} /> : index + 1}</span><strong>{item.title}</strong><small>{item.detail}</small></div>)}</div></section>}
        <section className={`panel quick-panel ${self ? "self-quick-panel" : ""}`}><div className="panel-head"><div><h2>常用工作</h2><p>仅显示当前岗位可进入的事项</p></div></div><div className="quick-links">{quickLinks.map((item) => <button key={item.view} onClick={() => go(item.view)}><item.icon size={20} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={17} /></button>)}</div></section>
      </div>
    </>
  );
}

function WorkListBatches({ batches }: { batches: Batch[] }) {
  if (!batches.length) return <div className="empty-inline work-empty"><FileCheck2 size={25} /><p>当前期间暂无权限范围内的计价批次。</p></div>;
  return <div className="work-list">{batches.slice(0, 5).map((batch) => <div key={batch.id}><span className="work-list-icon"><FileCheck2 size={17} /></span><div><strong>{batch.title}</strong><small>批次 #{String(batch.id).padStart(5, "0")} · {batch.employeeCount} 人</small></div><span className={`status-badge ${batch.status === "locked" ? "success" : batch.status === "review" ? "warning" : ""}`}>{statusText[batch.status] ?? batch.status}</span><b>{scoreText(batch.totalScore)}</b></div>)}</div>;
}

function WorkListShares({ shares, rules }: { shares: Share[]; rules: PricingRule[] }) {
  if (!shares.length) return <div className="empty-inline work-empty"><Users size={25} /><p>当前期间暂无本人分润记录。</p></div>;
  return <div className="work-list">{shares.slice(0, 5).map((share) => <div key={share.id}><span className="work-list-icon"><GitBranch size={17} /></span><div><strong>{rules.find((rule) => rule.id === share.ruleId)?.name ?? share.ruleId}</strong><small>{share.branch} · {share.reason}</small></div><span className={`status-badge ${share.status === "approved" ? "success" : "warning"}`}>{share.status === "approved" ? "已确认" : "待确认"}</span><b>{share.ratio}%</b></div>)}</div>;
}
