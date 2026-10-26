import { useState } from "react";
import { BadgeCheck, Check, CircleAlert, Download, FileCheck2, LockKeyhole, RotateCcw, Save, SquarePen } from "lucide-react";
import type { CalcInput } from "@contracts/pricing";
import { trpc } from "@/providers/trpc";
import { exportCsv } from "@/lib/exportCsv";
import { Modal } from "@/components/Modal";

export type BatchSnapshotEntry = {
  employee?: string;
  employeeId?: string;
  name?: string;
  branch?: string;
  ruleId?: string;
  ruleName?: string;
  ruleVersion?: number;
  ruleDefinition?: unknown;
  input?: CalcInput;
  score: number;
  expression?: string;
};

export type BatchRecord = {
  id: number;
  title: string;
  period: string;
  totalScore: number;
  employeeCount: number;
  status: string;
  resultSnapshot: unknown;
  ownerBranch: string;
  createdByName: string;
  submittedBy: number | null;
  approvedBy: number | null;
  returnReason: string | null;
  returnedByName: string;
  returnedAt: Date | null;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
};

type Props = {
  batch: BatchRecord;
  canApprove: boolean;
  canEdit: boolean;
  refresh: () => void;
  notify: (message: string, tone?: "success" | "error") => void;
  onClose: () => void;
};

const statusText: Record<string, string> = { draft: "草稿", review: "复核中", locked: "已锁定" };
const scoreText = (value: number) => value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputFields: Array<{ key: keyof CalcInput; label: string }> = [
  { key: "month", label: "时间进度 n" },
  { key: "directValue", label: "当月业务值" },
  { key: "opening", label: "年初值" },
  { key: "current", label: "当月值" },
  { key: "previous", label: "上月值" },
  { key: "cap", label: "积分封顶" },
  { key: "floor", label: "积分保底" },
];

function makeEditInputs(details: BatchSnapshotEntry[]) {
  return Object.fromEntries(details.map((item, index) => [index, item.input]).filter((entry) => entry[1])) as Record<number, CalcInput>;
}

export function BatchDetailModal({ batch, canApprove, canEdit, refresh, notify, onClose }: Props) {
  const details = Array.isArray(batch.resultSnapshot) ? batch.resultSnapshot as BatchSnapshotEntry[] : [];
  const [action, setAction] = useState<"detail" | "edit" | "return" | "approve">("detail");
  const [reason, setReason] = useState("");
  const [editTitle, setEditTitle] = useState(batch.title);
  const [editInputs, setEditInputs] = useState<Record<number, CalcInput>>(() => makeEditInputs(details));
  const returnMutation = trpc.pricing.returnBatch.useMutation({
    onSuccess: () => { refresh(); notify("批次已退回，退回原因已写入办理记录"); onClose(); },
  });
  const approveMutation = trpc.pricing.approveBatch.useMutation({
    onSuccess: () => { refresh(); notify("审批完成，批次与规则快照已锁定"); onClose(); },
  });
  const updateMutation = trpc.pricing.updateBatch.useMutation({
    onSuccess: () => { refresh(); notify("修改已保存，服务端已重新计算明细和总积分"); onClose(); },
  });
  const canEditDraft = canEdit && batch.status === "draft" && details.length > 0 && details.every((item) => item.employeeId && item.ruleId && item.ruleVersion && item.input);
  const pending = returnMutation.isPending || approveMutation.isPending || updateMutation.isPending;
  const error = returnMutation.error ?? approveMutation.error ?? updateMutation.error;

  const updateInput = (index: number, key: keyof CalcInput, value: string) => {
    setEditInputs((current) => {
      const base = current[index] ?? details[index]?.input;
      if (!base) return current;
      return { ...current, [index]: { ...base, [key]: value === "" && (key === "cap" || key === "floor") ? null : Number(value) } };
    });
  };

  const resetEdit = () => {
    setEditTitle(batch.title);
    setEditInputs(makeEditInputs(details));
    setAction("detail");
    updateMutation.reset();
  };

  const saveUpdate = () => {
    const snapshot = details.map((item, index) => ({
      employee: item.employee ?? item.name ?? "历史人员",
      employeeId: item.employeeId!,
      ruleId: item.ruleId!,
      ruleName: item.ruleName ?? "历史指标",
      ruleVersion: item.ruleVersion!,
      ruleDefinition: item.ruleDefinition,
      input: editInputs[index] ?? item.input!,
      score: item.score,
      expression: item.expression ?? "",
    }));
    updateMutation.mutate({ id: batch.id, title: editTitle.trim(), snapshot });
  };

  const exportDetails = () => {
    exportCsv(`批次${batch.id}-计价明细.csv`, ["批次号", "期间", "人员", "人员编码", "机构", "产品编码", "产品名称", "规则版本", "时间进度n", "当月业务值", "年初值", "当月值", "上月值", "积分封顶", "积分保底", "计算过程", "积分"], details.map((item) => [
      batch.id,
      batch.period,
      item.employee ?? item.name ?? "历史汇总快照",
      item.employeeId ?? "—",
      item.branch ?? "—",
      item.ruleId ?? "—",
      item.ruleName ?? "—",
      item.ruleVersion ? `V${item.ruleVersion}` : "—",
      item.input?.month ?? "—",
      item.input?.directValue ?? "—",
      item.input?.opening ?? "—",
      item.input?.current ?? "—",
      item.input?.previous ?? "—",
      item.input?.cap ?? "—",
      item.input?.floor ?? "—",
      item.expression ?? "历史快照未保存计算过程",
      item.score,
    ]));
    notify(`批次 #${batch.id} 的${details.length}条计价明细已导出`);
  };

  return (
    <Modal title={`批次 #${String(batch.id).padStart(5, "0")} · ${batch.title}`} onClose={onClose} wide>
      <div className="batch-detail-summary">
        <div><span>所属期间</span><strong>{batch.period}</strong></div>
        <div><span>当前状态</span><strong>{statusText[batch.status] ?? batch.status}</strong></div>
        <div><span>计价人员</span><strong>{batch.employeeCount} 人</strong></div>
        <div><span>合计积分</span><strong>{scoreText(batch.totalScore)}</strong></div>
      </div>
      <div className="batch-detail-meta">
        <span>创建人：{batch.createdByName || "历史记录"}</span>
        <span>创建时间：{new Date(batch.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
        <span>明细：{details.length} 条</span>
      </div>
      {batch.returnReason && <div className="batch-return-note"><RotateCcw size={18} /><div><strong>最近一次退回原因</strong><p>{batch.returnReason}</p><small>{batch.returnedByName || "复核人员"}{batch.returnedAt ? ` · ${new Date(batch.returnedAt).toLocaleString("zh-CN", { hour12: false })}` : ""}</small></div></div>}
      {action === "edit" && <div className="batch-review-action"><label className="field">批次名称<input value={editTitle} maxLength={100} onChange={(event) => setEditTitle(event.target.value)} /></label><p>人员和计价产品保持不变。保存后由服务端按当前正式规则重新计算每条明细、计价人数和总积分。</p></div>}

      <section className="batch-detail-section" aria-label="计价明细">
        <div className="batch-detail-section-head"><div><span>结果与规则快照</span><h3>逐条核对计算依据</h3></div><span>{action === "edit" ? "原结果仅供核对，保存后重算" : `${details.reduce((sum, item) => sum + item.score, 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })} 积分`}</span></div>
        {details.length === 0 ? <div className="empty-inline"><FileCheck2 size={25} /><p>该历史批次未保存明细快照。</p></div> : <div className="batch-detail-list">{details.map((item, index) => (
          <article className="batch-detail-item" key={`${item.employeeId ?? item.name ?? "row"}-${item.ruleId ?? "summary"}-${index}`}>
            <header><div><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.employee ?? item.name ?? "历史汇总快照"}</strong><small>{item.employeeId ?? "—"}{item.branch ? ` · ${item.branch}` : ""}</small></div>{action === "edit" ? <span className="status-badge warning">保存后重算</span> : <strong>{scoreText(item.score)}<small> 积分</small></strong>}</header>
            <div className="batch-detail-rule"><span>{item.ruleName ?? "历史汇总结果"}</span><b>{item.ruleId ?? "—"}{item.ruleVersion ? ` · V${item.ruleVersion}` : ""}</b></div>
            {item.input ? <dl className="batch-input-grid">{inputFields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{action === "edit" ? <input aria-label={`${item.employee ?? item.name ?? "明细"}${label}`} type="number" step={key === "month" ? 1 : 0.01} min={key === "month" ? 1 : undefined} max={key === "month" ? 12 : undefined} value={editInputs[index]?.[key] ?? ""} onChange={(event) => updateInput(index, key, event.target.value)} /> : item.input?.[key] ?? "—"}</dd></div>)}</dl> : <p className="small-muted">历史快照未保存业务输入。</p>}
            <div className="batch-expression"><span>{action === "edit" ? "原计算过程" : "计算过程"}</span><code>{item.expression ?? "历史快照未保存计算过程"}</code></div>
            {item.ruleDefinition !== null && item.ruleDefinition !== undefined && <details className="batch-rule-snapshot"><summary>查看完整规则定义快照</summary><pre>{JSON.stringify(item.ruleDefinition, null, 2)}</pre></details>}
          </article>
        ))}</div>}
      </section>

      {action === "return" && <div className="batch-review-action"><label className="field">退回原因<textarea rows={4} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请具体说明需要核对或修改的内容（至少4个字）" autoFocus /></label><p>退回后批次恢复为草稿，提交人修改后可重新提交；本次原因和办理人将保留在记录中。</p></div>}
      {action === "approve" && <div className="confirm-content"><LockKeyhole size={34} /><p>请确认已逐项核对人员、业务输入、计算过程和规则版本。锁定后不可直接修改或退回，如需调整须另建冲正或补录批次。</p></div>}
      {error && <p className="form-error" role="alert"><CircleAlert size={15} />{error.message}</p>}

      <div className="modal-actions batch-detail-actions">
        <button className="button secondary batch-export-button" onClick={exportDetails} disabled={details.length === 0 || action === "edit"}><Download size={16} />导出明细</button>
        {action === "detail" && canEditDraft && <button className="button secondary" onClick={() => setAction("edit")}><SquarePen size={16} />编辑明细</button>}
        {action === "detail" && canApprove && batch.status === "review" && <>
          <button className="button secondary" onClick={() => setAction("return")}><RotateCcw size={16} />退回修改</button>
          <button className="button primary" onClick={() => setAction("approve")}><BadgeCheck size={16} />审批锁定</button>
        </>}
        {action === "edit" && <>
          <button className="button secondary" onClick={resetEdit} disabled={pending}>取消</button>
          <button className="button primary" disabled={editTitle.trim().length < 2 || pending || !canEditDraft} onClick={saveUpdate}>{updateMutation.isPending ? "保存中…" : "保存修改"}<Save size={16} /></button>
        </>}
        {action === "return" && <>
          <button className="button secondary" onClick={() => { setAction("detail"); returnMutation.reset(); }} disabled={pending}>取消</button>
          <button className="button primary" disabled={reason.trim().length < 4 || pending} onClick={() => returnMutation.mutate({ id: batch.id, reason: reason.trim() })}>{pending ? "正在退回…" : "确认退回"}<Check size={16} /></button>
        </>}
        {action === "approve" && <>
          <button className="button secondary" onClick={() => { setAction("detail"); approveMutation.reset(); }} disabled={pending}>再检查一下</button>
          <button className="button primary" disabled={pending} onClick={() => approveMutation.mutate({ id: batch.id })}>{pending ? "处理中…" : "确认审批锁定"}<LockKeyhole size={16} /></button>
        </>}
      </div>
    </Modal>
  );
}
