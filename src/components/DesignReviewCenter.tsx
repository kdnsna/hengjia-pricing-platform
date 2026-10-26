import { useState } from "react";
import { BookOpen, Check, CircleAlert, Clock3, FlaskConical, History, RotateCcw, Search, Send, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { METHOD_LABELS, type IndicatorDesignRecord, type PricingRule } from "@contracts/pricing";
import type { IndicatorTestResult } from "@contracts/indicator";
import { DesignerModal } from "./DesignerModal";

type Notify = (message: string, tone?: "success" | "error") => void;

export function DesignReviewCenter({ designs, rules, refresh, notify }: { designs: IndicatorDesignRecord[]; rules: PricingRule[]; refresh: () => void; notify: Notify }) {
  const [tab, setTab] = useState<"review" | "history">("review");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<IndicatorDesignRecord | null>(null);
  const [tests, setTests] = useState<IndicatorTestResult[] | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const test = trpc.pricing.testDesign.useMutation({ onError: (error) => notify(error.message, "error") });
  const publish = trpc.pricing.publishDesign.useMutation({ onSuccess: (result) => { setConfirmPublish(false); setSelected(null); refresh(); notify(`指标已发布为正式版本 V${result.version}`); }, onError: (error) => { setConfirmPublish(false); notify(error.message, "error"); } });
  const returnDesign = trpc.pricing.returnDesign.useMutation({ onSuccess: () => { setSelected(null); setReturnReason(""); refresh(); notify("设计稿已退回管理员修改"); }, onError: (error) => notify(error.message, "error") });
  const source = designs.filter((design) => tab === "review" ? design.status === "review" : design.status === "published" || design.status === "archived");
  const rows = source.filter((design) => `${design.ruleId}${design.name}${design.definition.group}`.toLowerCase().includes(query.toLowerCase()));

  const open = (design: IndicatorDesignRecord) => {
    setSelected(design);
    setTests(null);
    setReturnReason("");
  };
  const runTests = async () => {
    if (!selected) return;
    try {
      const result = await test.mutateAsync({ definition: selected.definition });
      setTests(result.results);
      notify(result.passed ? "服务端独立复测通过" : "复测未通过，请退回修改", result.passed ? "success" : "error");
    } catch { /* mutation error is shown by the shared notification */ }
  };
  const passed = Boolean(tests?.length && tests.every((item) => item.passed));

  return (
    <div className="design-review-center">
      <div className="page-head"><div><span className="eyebrow">指标复核</span><h1>核对定义、公式和测试结果。</h1><p>复核人员不能修改设计内容；可独立复测、退回修改或发布正式版本。提交人与发布人不能是同一人。</p></div></div>
      <section className="review-summary"><div><Clock3 size={20} /><span>等待复核<strong>{designs.filter((item) => item.status === "review").length}</strong><small>项</small></span></div><div><ShieldCheck size={20} /><span>已发布记录<strong>{designs.filter((item) => item.status === "published").length}</strong><small>项</small></span></div><div><History size={20} /><span>已归档记录<strong>{designs.filter((item) => item.status === "archived").length}</strong><small>项</small></span></div><p>复核发布只改变当前设计版本，不回写或删除既有批次。</p></section>
      <div className="tab-bar"><button className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}><ShieldCheck size={17} />待复核<span>{designs.filter((item) => item.status === "review").length}</span></button><button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}><BookOpen size={17} />发布与归档记录<span>{designs.filter((item) => item.status === "published" || item.status === "archived").length}</span></button></div>
      <section className="panel table-panel"><div className="filter-bar"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索指标编码、名称或分组" /><kbd>{rows.length}</kbd></label></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>指标</th><th>目标版本</th><th>计算与单价</th><th>生效期间</th><th>提交 / 发布日期</th><th>状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{rows.map((design) => <tr key={design.id}><td><strong>{design.name}</strong><small>{design.ruleId} · {design.definition.category} / {design.definition.group}</small></td><td>V{design.baseVersion + 1}</td><td><span>{METHOD_LABELS[design.definition.method]}</span><small>存量 {design.definition.stockRate ?? "—"} · 正增 {design.definition.positiveRate ?? "—"} · 负增 {design.definition.negativeRate ?? "—"}</small></td><td><span>{design.definition.assessment.effectiveFrom}</span><small>至 {design.definition.assessment.effectiveTo}</small></td><td><span className="date-cell">{new Date(design.submittedAt ?? design.publishedAt ?? design.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span></td><td><span className={`status-badge ${design.status === "published" ? "success" : "warning"}`}>{design.status === "review" ? "待复核" : design.status === "published" ? "已发布" : "已归档"}</span></td><td><button className="text-button" onClick={() => open(design)}>{design.status === "review" ? <ShieldCheck size={14} /> : <History size={14} />}{design.status === "review" ? "进入复核" : "查看记录"}</button></td></tr>)}</tbody></table></div>
        {!rows.length && <div className="empty-inline"><Check size={24} /><p>{tab === "review" ? "当前没有等待复核的指标。" : "没有匹配的发布或归档记录。"}</p></div>}
        <div className="table-footer"><span>显示 {rows.length} / {source.length} 项</span><span>正式指标共 {rules.length} 项</span></div>
      </section>

      {selected && <DesignerModal title={`${selected.name} · V${selected.baseVersion + 1}`} onClose={() => { if (!publish.isPending) setSelected(null); }} wide><div className="review-detail">
        <div className="review-detail-head"><div><span className={`status-badge ${selected.status === "published" ? "success" : "warning"}`}>{selected.status === "review" ? "待复核" : selected.status === "published" ? "已发布" : "已归档"}</span><h3>{selected.ruleId} · {selected.definition.name}</h3><p>{selected.definition.description}</p></div><span>目标版本 V{selected.baseVersion + 1}</span></div>
        <dl className="review-definition"><div><dt>分类与分组</dt><dd>{selected.definition.category} · {selected.definition.group}</dd></div><div><dt>责任部门 / 岗位</dt><dd>{selected.definition.department} · {selected.definition.owner}</dd></div><div><dt>计算方式</dt><dd>{METHOD_LABELS[selected.definition.method]} · {selected.definition.unit}</dd></div><div><dt>取数关联</dt><dd>{selected.definition.sourceCode || "未配置"} → {selected.definition.metricCode || "未配置"}</dd></div><div><dt>考核周期与复核</dt><dd>{selected.definition.assessment.cycle} · {selected.definition.assessment.reviewFlow}</dd></div><div><dt>生效期间</dt><dd>{selected.definition.assessment.effectiveFrom} 至 {selected.definition.assessment.effectiveTo}</dd></div></dl>
        <div className="review-formula"><span>计价公式</span><code>{selected.definition.formula}</code></div>
        <div className="review-policy"><strong>考核细则</strong><p>{selected.definition.assessment.description}</p><strong>排除、冲正与补录</strong><p>{selected.definition.assessment.exclusions}</p></div>
        {selected.status === "review" && <div className="review-test-block"><div><div><h3>独立复测</h3><p>由服务端重新执行正向、负向、零值和一月进度四组测试。</p></div><button className="button secondary" onClick={runTests} disabled={test.isPending}><FlaskConical size={16} />{test.isPending ? "复测中…" : tests ? "重新复测" : "运行独立复测"}</button></div>{tests && <div className="review-test-results">{tests.map((result) => <span key={result.name} className={result.passed ? "pass" : "fail"}>{result.passed ? <Check size={14} /> : <CircleAlert size={14} />}{result.name}<b>{result.passed ? `${result.score ?? 0} 积分` : result.error}</b></span>)}</div>}</div>}
        {selected.testSnapshot && <details className="submitted-tests"><summary>查看提交时保存的四组测试记录</summary>{selected.testSnapshot.map((item) => <div key={item.name}><span>{item.name}</span><strong>{item.score} 积分</strong><code>{item.expression}</code></div>)}</details>}
        {selected.status === "review" && <div className="review-actions"><div className="return-box"><label>退回原因<textarea rows={2} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="需要修改时，请写明具体问题和调整要求" /></label><button className="button secondary" disabled={returnReason.trim().length < 4 || returnDesign.isPending} onClick={() => returnDesign.mutate({ id: selected.id, reason: returnReason.trim() })}><RotateCcw size={16} />退回修改</button></div><div className="publish-box"><p>{passed ? "独立复测已通过，可进入发布确认。" : "发布前必须先完成并通过本次独立复测。"}</p><button className="button primary" disabled={!passed || publish.isPending} onClick={() => setConfirmPublish(true)}><Send size={16} />发布正式版本</button></div></div>}
      </div></DesignerModal>}

      {confirmPublish && selected && <DesignerModal title={`确认发布 ${selected.name}？`} onClose={() => setConfirmPublish(false)}><div className="confirm-content"><ShieldCheck size={36} /><p>将发布 V{selected.baseVersion + 1}，写入正式指标库。系统会再次校验提交人与发布人不是同一人，并重新执行全部测试。</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmPublish(false)}>取消</button><button className="button primary" disabled={publish.isPending} onClick={() => publish.mutate({ id: selected.id })}>{publish.isPending ? "发布中…" : "确认发布"}<Check size={16} /></button></div></DesignerModal>}
    </div>
  );
}
