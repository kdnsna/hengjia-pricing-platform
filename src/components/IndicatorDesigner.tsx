import { useMemo, useState } from "react";
import {
  Ban, BookOpen, Check, ChevronRight, CircleAlert, Clock3, FlaskConical,
  History, Pencil, Plus, RotateCcw, Search, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { METHOD_LABELS, type CalcMethod, type Category, type IndicatorDefinition, type IndicatorDesignRecord, type PricingRule } from "@contracts/pricing";
import { definitionFromRule, emptyIndicator } from "@contracts/indicator";
import { IndicatorEditor } from "./IndicatorEditor";
import { DesignerModal } from "./DesignerModal";

type Notify = (message: string, tone?: "success" | "error") => void;
type CatalogStatus = "active" | "disabled" | "draft" | "review" | "archived";
type CatalogEntry = {
  key: string;
  ruleId: string;
  name: string;
  category: Category;
  group: string;
  method: CalcMethod;
  status: CatalogStatus;
  version: number;
  updatedAt?: Date;
  rule?: PricingRule;
  design?: IndicatorDesignRecord;
};
type EditorConfig = {
  key: number;
  definition: IndicatorDefinition;
  designId: number | null;
  baseVersion: number;
  status: "draft" | "review";
  initialStep: number;
  testSnapshot: IndicatorDesignRecord["testSnapshot"];
};

const STATUS_LABEL: Record<CatalogStatus, string> = { active: "正式", disabled: "已停用", draft: "草稿", review: "待复核", archived: "已归档" };
const formatDate = (value?: Date | null) => value ? new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const formatRate = (value: number | null) => value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });

function nextIndicatorCode(rules: PricingRule[], designs: IndicatorDesignRecord[]) {
  const ids = [...rules.map((rule) => rule.id), ...designs.map((design) => design.ruleId)];
  const max = ids.reduce((highest, id) => {
    const match = /^N(\d+)$/.exec(id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `N${String(max + 1).padStart(3, "0")}`;
}

export function IndicatorDesigner({ rules, designs, initialRule, onInitialConsumed, refresh, notify }: { rules: PricingRule[]; designs: IndicatorDesignRecord[]; initialRule?: PricingRule | null; onInitialConsumed: () => void; refresh: () => void; notify: Notify }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | CatalogStatus>("all");
  const [category, setCategory] = useState<"全部" | Category>("全部");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [reviewStatusFor, setReviewStatusFor] = useState<IndicatorDesignRecord | null>(null);
  const [ruleStatusConfirm, setRuleStatusConfirm] = useState<{ rule: PricingRule; status: "active" | "disabled" } | null>(null);
  const [config, setConfig] = useState<EditorConfig | null>(() => initialRule ? {
    key: Date.now(), definition: definitionFromRule(initialRule), designId: null, baseVersion: initialRule.version ?? 1, status: "draft", initialStep: 0, testSnapshot: null,
  } : null);
  const statusMutation = trpc.pricing.setRuleStatus.useMutation();

  const openDesigns = useMemo(() => designs.filter((design) => design.status === "draft" || design.status === "review"), [designs]);
  const catalogDesigns = useMemo(() => designs.filter((design) => design.status !== "published"), [designs]);
  const entries = useMemo<CatalogEntry[]>(() => [
    ...catalogDesigns.map((design): CatalogEntry => ({
      key: `design-${design.id}`,
      ruleId: design.ruleId,
      name: design.name,
      category: design.definition.category,
      group: design.definition.group,
      method: design.definition.method,
      status: design.status as "draft" | "review" | "archived",
      version: design.baseVersion + 1,
      updatedAt: design.updatedAt,
      design,
    })),
    ...rules.map((rule): CatalogEntry => ({
      key: `rule-${rule.id}`,
      ruleId: rule.id,
      name: rule.name,
      category: rule.category,
      group: rule.group,
      method: rule.method,
      status: rule.status === "disabled" ? "disabled" : "active",
      version: rule.version ?? 1,
      updatedAt: rule.updatedAt,
      rule,
    })),
  ], [catalogDesigns, rules]);

  const filtered = entries.filter((entry) => {
    const matchesStatus = status === "all" || entry.status === status;
    const matchesCategory = category === "全部" || entry.category === category;
    const haystack = `${entry.ruleId}${entry.name}${entry.group}${entry.rule?.sourceCode ?? ""}${entry.design?.definition.sourceCode ?? ""}`.toLowerCase();
    return matchesStatus && matchesCategory && haystack.includes(query.toLowerCase());
  });

  const startNew = () => setConfig({ key: Date.now(), definition: emptyIndicator(nextIndicatorCode(rules, designs)), designId: null, baseVersion: 0, status: "draft", initialStep: 0, testSnapshot: null });
  const startRevision = (rule: PricingRule) => setConfig({ key: Date.now(), definition: definitionFromRule(rule), designId: null, baseVersion: rule.version ?? 1, status: "draft", initialStep: 0, testSnapshot: null });
  const startDesign = (design: IndicatorDesignRecord) => {
    if (design.status === "review") {
      setReviewStatusFor(design);
      return;
    }
    setConfig({ key: Date.now(), definition: design.definition, designId: design.id, baseVersion: design.baseVersion, status: "draft", initialStep: 0, testSnapshot: design.testSnapshot });
  };
  const exitEditor = () => { setConfig(null); onInitialConsumed(); };

  const changeRuleStatus = async () => {
    if (!ruleStatusConfirm) return;
    try {
      await statusMutation.mutateAsync({ id: ruleStatusConfirm.rule.id, status: ruleStatusConfirm.status, reason: "通过指标设计平台确认状态变更及业务影响范围。" });
      notify(`${ruleStatusConfirm.rule.name} 已${ruleStatusConfirm.status === "active" ? "启用" : "停用"}`);
      setRuleStatusConfirm(null);
      refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "状态变更失败", "error");
    }
  };

  if (config) return <IndicatorEditor key={config.key} initialDefinition={config.definition} initialDesignId={config.designId} baseVersion={config.baseVersion} initialStatus={config.status} initialStep={config.initialStep} testSnapshot={config.testSnapshot} rules={rules} refresh={refresh} notify={notify} onExit={exitEditor} />;

  const historyRule = rules.find((rule) => rule.id === historyFor);
  const historyRows = designs.filter((design) => design.ruleId === historyFor && (design.status === "published" || design.status === "archived"));

  return (
    <div className="indicator-designer">
      <div className="page-head"><div><span className="eyebrow">指标管理</span><h1>指标设计</h1><p>新增或修订计价指标，维护计算方式、单价、公式和考核细则。管理员保存并提交后，由独立复核人员复测、退回或发布。</p></div><div className="page-actions"><button className="button primary" onClick={startNew}><Plus size={17} />设计新指标</button></div></div>

      <section className="design-metrics"><div><BookOpen size={19} /><span>正式指标<strong>{rules.filter((rule) => rule.status === "active").length}</strong><small>项正在使用</small></span></div><div><Pencil size={19} /><span>设计草稿<strong>{openDesigns.filter((design) => design.status === "draft").length}</strong><small>项未提交</small></span></div><div><ShieldCheck size={19} /><span>等待复核<strong>{openDesigns.filter((design) => design.status === "review").length}</strong><small>项待独立复核</small></span></div><div><FlaskConical size={19} /><span>发布记录<strong>{designs.filter((design) => design.status === "published").length}</strong><small>个历史版本</small></span></div></section>

      <div className="design-principles"><span><Check size={15} />正式版与草稿隔离</span><span><Check size={15} />公式白名单安全校验</span><span><Check size={15} />四组场景发布回归</span><span><Check size={15} />单价、细则与公式同版保存</span></div>

      <section className="panel table-panel design-catalog">
        <div className="filter-bar"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编码、指标、分组或M码" /><kbd>{filtered.length}</kbd></label><div className="segmented design-status-filter">{(["all", "active", "draft", "review", "disabled", "archived"] as const).map((value) => <button key={value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{value === "all" ? "全部" : STATUS_LABEL[value]}</button>)}</div><label className="select-wrap"><SlidersHorizontal size={16} /><select value={category} onChange={(event) => setCategory(event.target.value as "全部" | Category)}><option>全部</option><option>利润</option><option>规模</option><option>客户</option></select></label></div>
        <div className="table-scroll"><table className="data-table design-table"><thead><tr><th>指标定义</th><th>状态 / 版本</th><th>计算方式</th><th>单价体系</th><th>考核与生效</th><th>最近更新</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{filtered.map((entry) => {
          const definition = entry.design?.definition ?? entry.rule?.definition;
          return <tr key={entry.key}><td><strong>{entry.name}</strong><small>{entry.ruleId} · {entry.category} / {entry.group}</small></td><td><span className={`status-badge ${entry.status === "active" ? "success" : entry.status === "disabled" ? "" : "warning"}`}>{STATUS_LABEL[entry.status]}</span><small>V{entry.version}</small></td><td><span>{METHOD_LABELS[entry.method]}</span><small>{definition?.sourceUnit ?? "万元"} · ÷{definition?.unitFactor ?? 1}</small></td><td className="number"><strong>{formatRate(entry.rule?.stockRate ?? entry.design?.definition.stockRate ?? null)}</strong><small>正增 {formatRate(entry.rule?.positiveRate ?? entry.design?.definition.positiveRate ?? null)} · 负增 {formatRate(entry.rule?.negativeRate ?? entry.design?.definition.negativeRate ?? null)}</small></td><td><span>{definition?.assessment.cycle ?? "月度"} · {definition?.assessment.reviewFlow ?? "一级复核"}</span><small>{definition?.assessment.effectiveFrom ?? "2026-01-01"} 起</small></td><td><span className="date-cell">{formatDate(entry.updatedAt)}</span></td><td><div className="design-row-actions">{entry.rule && <button className="text-button" onClick={() => startRevision(entry.rule!)}><Pencil size={14} />创建新版</button>}{entry.design && entry.design.status !== "archived" && <button className="text-button" onClick={() => startDesign(entry.design!)}>{entry.design.status === "review" ? <Clock3 size={14} /> : <Pencil size={14} />}{entry.design.status === "review" ? "查看复核状态" : "继续设计"}</button>}<button className="icon-button" onClick={() => setHistoryFor(entry.ruleId)} aria-label={`查看${entry.name}版本记录`}><History size={16} /></button>{entry.rule && <button className="icon-button" onClick={() => setRuleStatusConfirm({ rule: entry.rule!, status: entry.status === "disabled" ? "active" : "disabled" })} aria-label={`${entry.status === "disabled" ? "启用" : "停用"}${entry.name}`}>{entry.status === "disabled" ? <RotateCcw size={16} /> : <Ban size={16} />}</button>}</div></td></tr>;
        })}</tbody></table></div>
        {filtered.length === 0 && <div className="empty-inline"><Search size={24} /><p>没有匹配的指标或设计稿。</p><button className="text-button" onClick={() => { setQuery(""); setStatus("all"); setCategory("全部"); }}>清空筛选</button></div>}
        <div className="table-footer"><span>显示 {filtered.length} / {entries.length} 项（含进行中的设计稿）</span><span>已发布版本在“版本记录”中完整保留</span></div>
      </section>

      {reviewStatusFor && <DesignerModal title={`${reviewStatusFor.name} · 复核状态`} onClose={() => setReviewStatusFor(null)} wide>
        <div className="review-detail">
          <div className="review-detail-head"><div><span className="status-badge warning">等待独立复核</span><h3>{reviewStatusFor.ruleId} · 目标版本 V{reviewStatusFor.baseVersion + 1}</h3><p>提交于 {formatDate(reviewStatusFor.submittedAt)}，复核人员处理前，设计内容保持只读。</p></div><Clock3 size={24} /></div>
          <dl className="review-definition"><div><dt>分类与分组</dt><dd>{reviewStatusFor.definition.category} · {reviewStatusFor.definition.group}</dd></div><div><dt>计算方式</dt><dd>{METHOD_LABELS[reviewStatusFor.definition.method]} · {reviewStatusFor.definition.unit}</dd></div><div><dt>单价</dt><dd>存量 {formatRate(reviewStatusFor.definition.stockRate)} · 正增 {formatRate(reviewStatusFor.definition.positiveRate)} · 负增 {formatRate(reviewStatusFor.definition.negativeRate)}</dd></div><div><dt>取数关联</dt><dd>{reviewStatusFor.definition.sourceCode || "未配置"} → {reviewStatusFor.definition.metricCode || "未配置"}</dd></div><div><dt>考核周期</dt><dd>{reviewStatusFor.definition.assessment.cycle} · {reviewStatusFor.definition.assessment.reviewFlow}</dd></div><div><dt>生效期间</dt><dd>{reviewStatusFor.definition.assessment.effectiveFrom} 至 {reviewStatusFor.definition.assessment.effectiveTo}</dd></div></dl>
          <div className="review-formula"><span>计价公式</span><code>{reviewStatusFor.definition.formula}</code></div>
          <div className="review-policy"><strong>考核细则</strong><p>{reviewStatusFor.definition.assessment.description}</p><strong>排除、冲正与补录</strong><p>{reviewStatusFor.definition.assessment.exclusions}</p></div>
          {reviewStatusFor.testSnapshot && <details className="submitted-tests"><summary>查看提交时保存的四组测试记录</summary>{reviewStatusFor.testSnapshot.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.score} 积分</strong><code>{item.expression}</code></div>)}</details>}
          <div className="notice-box"><Clock3 size={17} /><p>如需修改，请等待复核人员退回；退回后该设计恢复为草稿，可继续编辑并重新提交。</p></div>
          <div className="modal-actions"><button className="button secondary" onClick={() => setReviewStatusFor(null)}>关闭</button></div>
        </div>
      </DesignerModal>}

      {historyFor && <DesignerModal title={`${historyRule?.name ?? historyFor} · 版本记录`} onClose={() => setHistoryFor(null)} wide><div className="version-history">{historyRule ? <div className="current-version"><span className="status-badge success">当前{historyRule.status === "disabled" ? "停用" : "正式"}</span><strong>V{historyRule.version ?? 1}</strong><div><b>{historyRule.name}</b><p>{historyRule.formula ?? "年度标准预置算法；可通过创建新版生成显式公式与完整考核细则。"}</p></div></div> : <div className="current-version"><span className="status-badge warning">未发布</span><strong>—</strong><div><b>{historyFor}</b><p>该设计已归档，从未写入正式指标库；归档快照仍可查询。</p></div></div>}{historyRows.length === 0 ? <div className="empty-inline"><Clock3 size={24} /><p>暂无可查询的发布或归档记录。</p></div> : historyRows.map((design) => <div className="history-row" key={design.id}><span>V{design.baseVersion + 1}</span><div><strong>{design.name}</strong><p>{design.definition.assessment.cycle} · {METHOD_LABELS[design.definition.method]} · {formatDate(design.publishedAt)}发布</p><code>{design.definition.formula}</code></div><span className={`status-badge ${design.status === "published" ? "success" : "warning"}`}>{design.status === "published" ? "已发布版本" : "已归档记录"}</span></div>)}</div></DesignerModal>}

      {ruleStatusConfirm && <DesignerModal title={`${ruleStatusConfirm.status === "active" ? "启用" : "停用"}正式指标`} onClose={() => setRuleStatusConfirm(null)}><div className="confirm-content">{ruleStatusConfirm.status === "active" ? <RotateCcw size={36} /> : <CircleAlert size={36} />}<p>{ruleStatusConfirm.status === "active" ? "启用后，该指标会重新进入正式试算范围。" : "停用不会删除历史数据，但该指标将不再用于新的正式试算。请确认已完成影响范围评估。"}</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setRuleStatusConfirm(null)}>取消</button><button className="button primary" onClick={changeRuleStatus} disabled={statusMutation.isPending}>确认{ruleStatusConfirm.status === "active" ? "启用" : "停用"}<ChevronRight size={16} /></button></div></DesignerModal>}
    </div>
  );
}
