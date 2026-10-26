import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight, BookOpen, Check, ChevronRight, CircleAlert, CircleDashed,
  Database, Download, ExternalLink, FileCheck2, Info, Map as MapIcon,
  Network, Route as RouteIcon, Search, ShieldCheck, Workflow, X,
} from "lucide-react";
import {
  architectureLayers, capabilities, controlDomains, coreEntities, coverageMeta,
  designPrinciples, externalDependencies, governanceSteps, ledgerBoundaries,
  researchSources, roadmap, type BlueprintTarget, type Capability,
  type CoverageStatus, type ResearchSource,
} from "@contracts/blueprint";
import "./blueprint.css";

type BlueprintTab = "capabilities" | "architecture" | "flow" | "roadmap" | "sources";
type DomainFilter = "全部" | Capability["domain"];

const TABS = [
  { id: "capabilities" as const, label: "功能清单", icon: MapIcon },
  { id: "architecture" as const, label: "分层设计", icon: Network },
  { id: "flow" as const, label: "办理流程", icon: Workflow },
  { id: "roadmap" as const, label: "建设步骤", icon: RouteIcon },
  { id: "sources" as const, label: "资料依据", icon: BookOpen },
];

const TARGET_LABELS: Record<BlueprintTarget, string> = {
  dashboard: "经营总览",
  rules: "计价规则",
  designer: "指标设计",
  simulator: "计价试算",
  allocation: "业绩归属",
  validation: "规则核查",
  approval: "批次管理",
  accounts: "账号权限",
};

const DOMAINS: DomainFilter[] = ["全部", "组织与方案", "核算与归属", "结果与兑现", "平台与数据"];
const sourceMap = new Map(researchSources.map((source) => [source.id, source]));

export function PlatformBlueprint({ onNavigate, allowedTargets }: { onNavigate: (target: BlueprintTarget) => void; allowedTargets: string[] }) {
  const [tab, setTab] = useState<BlueprintTab>("capabilities");
  const [status, setStatus] = useState<"all" | CoverageStatus>("all");
  const [domain, setDomain] = useState<DomainFilter>("全部");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Capability | null>(null);
  const [exported, setExported] = useState(false);

  const counts = useMemo(() => ({
    current: capabilities.filter((item) => item.status === "current").length,
    partial: capabilities.filter((item) => item.status === "partial").length,
    planned: capabilities.filter((item) => item.status === "planned").length,
  }), []);

  const filtered = useMemo(() => capabilities.filter((item) => {
    const matchesStatus = status === "all" || item.status === status;
    const matchesDomain = domain === "全部" || item.domain === domain;
    const haystack = `${item.name}${item.english}${item.summary}${item.objects.join("")}${item.roles.join("")}`.toLowerCase();
    return matchesStatus && matchesDomain && haystack.includes(query.trim().toLowerCase());
  }), [status, domain, query]);

  const changeTab = (next: BlueprintTab) => {
    setTab(next);
    setSelected(null);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const resetFilters = () => {
    setStatus("all");
    setDomain("全部");
    setQuery("");
  };

  const exportCapabilities = () => {
    const rows = capabilities.map((item) => [
      item.order, item.name, item.domain, coverageMeta[item.status].label, item.priority,
      item.objects.join("／"), item.roles.join("／"), item.current, item.gap,
    ]);
    exportCsv("银行员工绩效计价平台-功能差距清单.csv", ["序号", "功能模块", "分组", "当前覆盖", "建设优先级", "业务对象", "责任角色", "现有基础", "主要缺口"], rows);
    setExported(true);
  };

  return (
    <div className="blueprint-page">
      <section className="blueprint-hero">
        <div className="blueprint-hero-copy">
          <span className="eyebrow">建设方案 · 2026</span>
          <h1>把计价、复核和<br />结果管理分开建设。</h1>
          <p>以现有指标和计价功能为基础，列清已经可用、部分具备和仍需建设的功能，明确责任分工与外部系统边界。</p>
          <button className="button blueprint-export" onClick={exportCapabilities}>
            {exported ? <Check size={17} /> : <Download size={17} />}
            {exported ? "已导出完整清单" : "导出功能差距清单"}
          </button>
        </div>
        <div className="blueprint-hero-matrix" aria-label="建设方案范围">
          <div><span>功能模块</span><strong>{capabilities.length}</strong><small>项功能</small></div>
          <div><span>架构分层</span><strong>{architectureLayers.length}</strong><small>层设计</small></div>
          <div><span>办理环节</span><strong>{governanceSteps.length}</strong><small>个环节</small></div>
          <div><span>资料来源</span><strong>{researchSources.length}</strong><small>项资料</small></div>
        </div>
        <div className="blueprint-hero-note">
          <Info size={18} />
          <p><strong>建设建议不等于已交付功能。</strong>已有、部分覆盖和规划中分别标识；外部接口、薪酬支付和监管报送在真正接通前均只作为规划。</p>
        </div>
      </section>

      <div className="blueprint-tabs" role="tablist" aria-label="建设方案视图">
        {TABS.map(({ id, label, icon: Icon }, index) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => changeTab(id)}>
            <span>{String(index + 1).padStart(2, "0")}</span><Icon size={17} />{label}
          </button>
        ))}
      </div>

      <div className="blueprint-tab-content" role="tabpanel">
        {tab === "capabilities" && (
          <CapabilityMap
            filtered={filtered}
            status={status}
            domain={domain}
            query={query}
            counts={counts}
            onStatus={(value) => { setStatus(value); setSelected(null); }}
            onDomain={(value) => { setDomain(value); setSelected(null); }}
            onQuery={(value) => { setQuery(value); setSelected(null); }}
            onReset={resetFilters}
            onSelect={setSelected}
          />
        )}
        {tab === "architecture" && <ArchitectureView />}
        {tab === "flow" && <GovernanceFlow />}
        {tab === "roadmap" && <RoadmapView />}
        {tab === "sources" && <SourcesView />}
      </div>

      {selected && <CapabilityDrawer capability={selected} allowedTargets={allowedTargets} onClose={() => setSelected(null)} onNavigate={(target) => { setSelected(null); onNavigate(target); }} />}
    </div>
  );
}

function CapabilityMap({
  filtered, status, domain, query, counts, onStatus, onDomain, onQuery, onReset, onSelect,
}: {
  filtered: Capability[];
  status: "all" | CoverageStatus;
  domain: DomainFilter;
  query: string;
  counts: Record<CoverageStatus, number>;
  onStatus: (value: "all" | CoverageStatus) => void;
  onDomain: (value: DomainFilter) => void;
  onQuery: (value: string) => void;
  onReset: () => void;
  onSelect: (item: Capability) => void;
}) {
  return (
    <section aria-label="功能清单">
      <div className="blueprint-section-intro">
        <div><span className="eyebrow">功能清单</span><h2>14 个功能模块，逐项列清差距。</h2></div>
        <p>建设状态按当前版本的实际功能填写，优先级用于安排后续工作；“已有能力”不代表已经覆盖所有生产要求。</p>
      </div>
      <div className="capability-browser">
        <aside className="capability-rail" aria-label="功能筛选">
          <div className="rail-group">
            <span className="rail-label">建设状态</span>
            <button className={status === "all" ? "active" : ""} onClick={() => onStatus("all")} aria-pressed={status === "all"}><span>全部功能</span><b>{capabilities.length}</b></button>
            {(Object.keys(coverageMeta) as CoverageStatus[]).map((key) => (
              <button key={key} className={`${status === key ? "active" : ""} coverage-${key}`} onClick={() => onStatus(key)} aria-pressed={status === key}>
                <span><i />{coverageMeta[key].label}</span><b>{counts[key]}</b>
              </button>
            ))}
          </div>
          <div className="rail-group">
            <span className="rail-label">功能分组</span>
            {DOMAINS.map((item) => <button key={item} className={domain === item ? "active" : ""} onClick={() => onDomain(item)} aria-pressed={domain === item}><span>{item}</span>{domain === item && <Check size={14} />}</button>)}
          </div>
          <div className="rail-note"><ShieldCheck size={17} /><p>建设状态按实际功能核对，不因存在菜单或页面就记为已完成。</p></div>
        </aside>
        <div className="capability-results">
          <div className="capability-search">
            <label className="search-field"><Search size={18} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索功能、业务对象或责任角色" aria-label="搜索功能清单" /><kbd>{filtered.length}</kbd></label>
            <span>{coverageMeta.current.description}</span>
          </div>
          {filtered.length > 0 ? <div className="capability-grid">{filtered.map((item) => (
            <button className={`capability-card coverage-${item.status}`} key={item.id} onClick={() => onSelect(item)} data-capability-id={item.id}>
              <div className="capability-card-top"><span className="capability-code">C{item.order}</span><CoverageBadge status={item.status} /><span className="priority-code">{item.priority}</span></div>
              <span className="capability-english">{item.english}</span>
              <h3>{item.name}</h3>
              <p>{item.summary}</p>
              <div className="capability-objects">{item.objects.slice(0, 4).map((object) => <span key={object}>{object}</span>)}</div>
              <div className="capability-card-foot"><span>{item.domain} · {item.roles[0]}</span><span>查看详情<ChevronRight size={15} /></span></div>
            </button>
          ))}</div> : <div className="blueprint-empty"><Search size={28} /><h3>没有匹配的功能模块</h3><p>调整建设状态、功能分组或搜索关键词。</p><button className="button secondary" onClick={onReset}>清空筛选</button></div>}
        </div>
      </div>
    </section>
  );
}

function CoverageBadge({ status }: { status: CoverageStatus }) {
  return <span className={`coverage-badge coverage-${status}`}><i />{coverageMeta[status].label}</span>;
}

function CapabilityDrawer({ capability, allowedTargets, onClose, onNavigate }: { capability: Capability; allowedTargets: string[]; onClose: () => void; onNavigate: (target: BlueprintTarget) => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [onClose]);
  const availableTargets = capability.existingTargets?.filter((target) => allowedTargets.includes(target)) ?? [];

  return (
    <div className="blueprint-drawer-layer">
      <button className="blueprint-drawer-backdrop" onClick={onClose} aria-label="关闭功能详情遮罩" />
      <aside className="blueprint-drawer" role="dialog" aria-modal="true" aria-labelledby="capability-detail-title">
        <header className="blueprint-drawer-head">
          <div><span>C{capability.order} · {capability.english}</span><h2 id="capability-detail-title">{capability.name}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭功能详情" autoFocus><X size={20} /></button>
        </header>
        <div className="blueprint-drawer-body">
          <div className="drawer-status-line"><CoverageBadge status={capability.status} /><span>建设优先级：<strong>{capability.priority}</strong></span><span>{capability.domain}</span></div>
          <p className="drawer-lead">{capability.summary}</p>
          <section className="drawer-current"><span>当前已有功能</span><p>{capability.current}</p></section>
          <section className="drawer-gap"><span>主要缺口</span><p>{capability.gap}</p></section>
          <DetailSection title="业务对象"><div className="drawer-tags">{capability.objects.map((item) => <span key={item}>{item}</span>)}</div></DetailSection>
          <DetailSection title="必备功能"><ol className="drawer-feature-list">{capability.features.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol></DetailSection>
          <DetailSection title="责任角色"><div className="drawer-tags roles">{capability.roles.map((item) => <span key={item}>{item}</span>)}</div></DetailSection>
          <div className="drawer-io"><div><span>输入</span><p>{capability.input}</p></div><div><span>输出</span><p>{capability.output}</p></div></div>
          {availableTargets.length > 0 && <DetailSection title="进入现有对应功能"><div className="drawer-module-links">{availableTargets.map((target) => <button key={target} onClick={() => onNavigate(target)}>{TARGET_LABELS[target]}<ArrowUpRight size={15} /></button>)}</div></DetailSection>}
          <DetailSection title="对应资料依据"><div className="drawer-sources">{capability.sourceIds.map((id) => {
            const source = sourceMap.get(id);
            return source ? <a href={source.url} target="_blank" rel="noreferrer" key={id}><span>{id}</span><strong>{source.title}</strong><ExternalLink size={14} /></a> : null;
          })}</div></DetailSection>
        </div>
      </aside>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="drawer-section"><h3>{title}</h3>{children}</section>;
}

function ArchitectureView() {
  return (
    <section aria-label="分层设计">
      <div className="blueprint-section-intro">
        <div><span className="eyebrow">分层设计</span><h2>六层分工，四本账分清。</h2></div>
        <p>每层分别列出当前基础和后续增补内容；业务处理、数据记录和外部回执共同支持结果核对、历史重算和账务对账。</p>
      </div>
      <div className="boundary-banner"><CircleAlert size={23} /><div><strong>计价积分 ≠ 应发工资</strong><p>绩效结果、薪酬计算、个税和实际支付必须分层交接；本平台不替代薪酬、税务或资金支付系统。</p></div><span>本项目核心边界</span></div>
      <div className="architecture-stack">
        {architectureLayers.map((layer) => (
          <article className="architecture-layer" key={layer.id}>
            <div className="architecture-layer-name"><span>{layer.id}</span><div><h3>{layer.name}</h3><small>{layer.english}</small></div></div>
            <p className="architecture-mission">{layer.mission}</p>
            <div className="architecture-layer-items"><div><span>现有基础</span><div>{layer.current.map((item) => <span className="architecture-chip current" key={item}>{item}</span>)}</div></div><div><span>目标增补</span><div>{layer.target.map((item) => <span className="architecture-chip target" key={item}>{item}</span>)}</div></div></div>
          </article>
        ))}
      </div>

      <div className="blueprint-subsection-head"><span>01 / 四本账边界</span><h2>四本账各自回答一个问题</h2><p>跨账关联但不互相冒充，所有交接均需要口径、权限和对账。</p></div>
      <div className="ledger-boundary-grid">{ledgerBoundaries.map((ledger, index) => (
        <article key={ledger.id}><div><span>{ledger.id}</span><b>0{index + 1}</b></div><h3>{ledger.name}</h3><strong>{ledger.question}</strong><small>{ledger.authority}</small><p>{ledger.rule}</p></article>
      ))}</div>

      <div className="blueprint-subsection-head"><span>02 / 数据来源</span><h2>核心实体与权威数据源</h2><p>平台可以保存业务快照和处理状态，但不能取代外部权威主数据或实际支付回执。</p></div>
      <div className="table-scroll blueprint-entity-wrap">
        <table className="data-table blueprint-entity-table"><thead><tr><th>核心实体</th><th>权威数据源</th><th>业务责任方</th><th>覆盖状态</th><th>建模要求</th></tr></thead><tbody>{coreEntities.map((entity) => <tr key={entity.name}><td><strong>{entity.name}</strong></td><td>{entity.authority}</td><td>{entity.owner}</td><td><CoverageBadge status={entity.status} /></td><td>{entity.note}</td></tr>)}</tbody></table>
      </div>

      <div className="blueprint-subsection-head"><span>03 / 控制要求</span><h2>八项平台控制要求</h2><p>安全、质量、算法和连续性不是上线后的附加项，而是每个版本的验收条件。</p></div>
      <div className="control-grid">{controlDomains.map((control) => (
        <article key={control.id}><div><span>{control.id}</span><ShieldCheck size={18} /></div><h3>{control.name}</h3><dl><div><dt>当前</dt><dd>{control.current}</dd></div><div><dt>目标控制</dt><dd>{control.target}</dd></div></dl><footer>{control.sourceIds.map((id) => <span key={id}>{id}</span>)}</footer></article>
      ))}</div>
    </section>
  );
}

function GovernanceFlow() {
  const [selectedId, setSelectedId] = useState(governanceSteps[0].id);
  const selected = governanceSteps.find((step) => step.id === selectedId) ?? governanceSteps[0];
  return (
    <section aria-label="业务办理流程">
      <div className="blueprint-section-intro">
        <div><span className="eyebrow">办理流程</span><h2>从方案到追索，逐步记录办理状态。</h2></div>
        <p>点击任一阶段查看责任角色、输入输出和控制点。驳回、质检失败、申诉与追索都有独立分支，不用一条“已完成”掩盖过程。</p>
      </div>
      <div className="governance-map" role="list" aria-label="十二个办理环节">{governanceSteps.map((step) => (
        <button role="listitem" key={step.id} className={`governance-order ${selectedId === step.id ? "active" : ""} coverage-${step.status}`} onClick={() => setSelectedId(step.id)} aria-pressed={selectedId === step.id} data-flow-id={step.id}>
          <span>{step.order}</span><strong>{step.name}</strong><small>{step.owner}</small><CoverageBadge status={step.status} /><p>{step.states}</p><ChevronRight size={17} />
        </button>
      ))}</div>
      <article className="governance-detail" aria-live="polite">
        <div className="governance-detail-title"><span>{selected.id}</span><div><span>当前选中环节</span><h3>{selected.name}</h3></div><CoverageBadge status={selected.status} /></div>
        <div className="governance-detail-grid"><div><span>责任角色</span><p>{selected.owner}</p></div><div><span>状态机</span><p>{selected.states}</p></div><div><span>输入</span><p>{selected.input}</p></div><div><span>输出</span><p>{selected.output}</p></div></div>
        <div className="governance-control"><ShieldCheck size={19} /><div><strong>关键控制</strong><p>{selected.control}</p></div></div>
      </article>
      <div className="branch-rules">
        <article><span>分支 01</span><h3>方案／批次驳回</h3><p>回到草稿或重新提交，保留原版本、驳回原因和操作人，不直接覆盖已审核证据。</p></article>
        <article><span>分支 02</span><h3>数据质检失败</h3><p>进入隔离区整改；未放行数据不得核算，修复后生成新数据快照并重新对账。</p></article>
        <article><span>分支 03</span><h3>员工申诉成立</h3><p>发起跨期冲正或补录，重新复核发布；已发布历史结果和处理过程均可查询。</p></article>
        <article><span>分支 04</span><h3>追索扣回触发</h3><p>未支付部分进入止付，已支付部分进入追回；争议、执行和结案分别以权威记录为准。</p></article>
      </div>
      <div className="blueprint-subsection-head"><span>设计约定</span><h2>六项本项目设计约定</h2><p>以下为本项目设计建议；法规适用性由本行合规部门结合实际复核。</p></div>
      <div className="design-decision-grid">{designPrinciples.map((principle, index) => <article key={principle.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{principle.title}</h3><p>{principle.text}</p></article>)}</div>
    </section>
  );
}

function RoadmapView() {
  return (
    <section aria-label="分阶段建设步骤">
      <div className="blueprint-section-intro">
        <div><span className="eyebrow">建设步骤</span><h2>先补基础控制，再补员工办理，最后按需扩展。</h2></div>
        <p>不以“大拆大建”或“一次接完所有系统”为目标。每一阶段都以可验证的业务控制和外部依赖就绪作为进入条件。</p>
      </div>
      <div className="roadmap-grid">{roadmap.map((phase) => (
        <article className={`roadmap-phase phase-${phase.phase.toLowerCase()}`} key={phase.phase}>
          <header><span>{phase.phase}</span><div><h2>{phase.name}</h2><p>{phase.timing}</p></div></header>
          <div className="roadmap-objective"><span>阶段目标</span><p>{phase.objective}</p></div>
          <RoadmapList title="建设范围" items={phase.scope} />
          <RoadmapList title="前置依赖" items={phase.dependencies} />
          <RoadmapList title="阶段验收口径" items={phase.acceptance} verification />
        </article>
      ))}</div>
      <div className="blueprint-subsection-head"><span>外部系统边界</span><h2>不能靠本平台一次性替代的五个外部边界</h2><p>这些依赖需要跨部门契约、制度与真实接口共同完成；在依赖就绪前只保留明确的规划和手工控制，不制造虚假成功状态。</p></div>
      <div className="external-boundary-list">{externalDependencies.map((dependency, index) => (
        <article key={dependency.name}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{dependency.name}</h3><p>{dependency.boundary}</p></div><Database size={19} /></article>
      ))}</div>
      <div className="roadmap-guardrail"><FileCheck2 size={24} /><div><h3>每阶段共同准出条件</h3><p>业务场景、权限与职责分离、接口失败、数据质量、历史回放、生产构建、桌面与移动端均完成真实验证；监管适用性与外部口径由对应责任部门复核。</p></div></div>
    </section>
  );
}

function RoadmapList({ title, items, verification = false }: { title: string; items: string[]; verification?: boolean }) {
  return <section className="roadmap-list"><h3>{title}</h3><ul>{items.map((item) => <li className={verification ? "verification" : ""} key={item}>{verification ? <CircleDashed size={14} /> : <span aria-hidden="true" />}<p>{item}</p></li>)}</ul></section>;
}

function SourcesView() {
  const [filter, setFilter] = useState<"all" | "requirements" | "practice">("all");
  const requirements = researchSources.filter((source) => source.kind !== "行业实践");
  const practices = researchSources.filter((source) => source.kind === "行业实践");
  return (
    <section aria-label="资料来源与适用说明">
      <div className="blueprint-section-intro">
        <div><span className="eyebrow">资料依据</span><h2>要求、实践与建议，分开陈述。</h2></div>
        <p>监管文件按各自适用范围理解，地方文件不扩展为全国统一要求，产品实践不等同于监管硬性要求。</p>
      </div>
      <div className="source-filter" role="group" aria-label="来源类型筛选">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} aria-pressed={filter === "all"}>全部来源<span>{researchSources.length}</span></button>
        <button className={filter === "requirements" ? "active" : ""} onClick={() => setFilter("requirements")} aria-pressed={filter === "requirements"}>监管、准则与官方标准<span>{requirements.length}</span></button>
        <button className={filter === "practice" ? "active" : ""} onClick={() => setFilter("practice")} aria-pressed={filter === "practice"}>成熟产品实践<span>{practices.length}</span></button>
      </div>
      <div className="research-notice"><Info size={18} /><p>检索日期：2026-10-25。以官方现有文本和最新检索为依据；投产前仍须由本行合规部门结合机构类型、属地要求和最新有效文本复核。</p></div>
      {(filter === "all" || filter === "requirements") && <SourceGroup title="监管要求、国际准则与官方标准" eyebrow="监管要求与标准" sources={requirements} />}
      {(filter === "all" || filter === "practice") && <SourceGroup title="成熟激励补偿产品通用实践" eyebrow="产品实践" sources={practices} practice />}
      <div className="blueprint-subsection-head project-recommendations"><span>本项目建议</span><h2>本项目设计建议 · 非监管原文</h2><p>以下为本平台的设计决策，用于统一后续建设口径，不作为监管或厂商结论。</p></div>
      <div className="design-decision-grid">{designPrinciples.map((principle, index) => <article key={principle.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{principle.title}</h3><p>{principle.text}</p></article>)}</div>
    </section>
  );
}

function SourceGroup({ title, eyebrow, sources, practice = false }: { title: string; eyebrow: string; sources: ResearchSource[]; practice?: boolean }) {
  return (
    <section className={`source-group ${practice ? "practice" : ""}`}>
      <div className="source-group-head"><span>{eyebrow}</span><h2>{title}</h2><b>{sources.length} 项</b></div>
      <div className="source-list">{sources.map((source) => (
        <article className="source-card" id={`source-${source.id}`} key={source.id}>
          <div className="source-card-index"><span>{source.id}</span><b>{source.kind}</b></div>
          <div className="source-card-content"><h3>{source.title}</h3><p className="source-meta">{source.organization} · {source.date}</p><p className="source-scope">适用范围：{source.scope}</p><p>{source.insight}</p></div>
          <a href={source.url} target="_blank" rel="noreferrer" aria-label={`查看${source.title}官方原文`}>查看官方原文<ExternalLink size={15} /></a>
        </article>
      ))}</div>
    </section>
  );
}

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = "﻿" + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
