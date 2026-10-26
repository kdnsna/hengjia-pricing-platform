import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Braces, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert,
  FlaskConical, Info, Save, Send, ShieldCheck, Archive,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { calculate, METHOD_LABELS, type CalcInput, type CalcMethod, type IndicatorDefinition, type IndicatorDesignRecord, type PricingRule } from "@contracts/pricing";
import { definitionToRule, formulaForMethod, TEST_INPUTS, validateIndicator, type IndicatorTestResult } from "@contracts/indicator";
import { FORMULA_VARIABLES } from "@contracts/formula";
import { DesignerModal } from "./DesignerModal";

const STEPS = ["基本定义", "计算与单价", "公式设计", "考核细则", "测试与提交"];
const nullableNumber = (value: string) => value.trim() === "" ? null : Number(value);
const messageOf = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请重试";

type EditorProps = {
  initialDefinition: IndicatorDefinition;
  initialDesignId: number | null;
  baseVersion: number;
  initialStatus: "draft" | "review";
  initialStep?: number;
  testSnapshot: IndicatorDesignRecord["testSnapshot"];
  rules: PricingRule[];
  refresh: () => void;
  notify: (message: string, tone?: "success" | "error") => void;
  onExit: () => void;
};

export function IndicatorEditor({ initialDefinition, initialDesignId, baseVersion, initialStatus, initialStep = 0, testSnapshot, rules, refresh, notify, onExit }: EditorProps) {
  const [form, setForm] = useState<IndicatorDefinition>(() => JSON.parse(JSON.stringify(initialDefinition)) as IndicatorDefinition);
  const [designId, setDesignId] = useState<number | null>(initialDesignId);
  const [status, setStatus] = useState<"draft" | "review">(initialStatus);
  const [step, setStep] = useState(initialStep);
  const [tests, setTests] = useState<IndicatorTestResult[] | null>(() => testSnapshot?.map((item) => ({ name: item.name as IndicatorTestResult["name"], passed: true, score: item.score, expression: item.expression })) ?? null);
  const [tested, setTested] = useState(initialStatus === "review");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [customInput, setCustomInput] = useState<CalcInput>({ month: 10, directValue: 100, opening: 1000, current: 1200, previous: 1100 });
  const [customResult, setCustomResult] = useState<{ score: number; expression: string } | null>(null);
  const [customError, setCustomError] = useState("");
  const formulaRef = useRef<HTMLTextAreaElement>(null);
  const validation = useMemo(() => validateIndicator(form), [form]);
  const saveMutation = trpc.pricing.saveDesign.useMutation();
  const testMutation = trpc.pricing.testDesign.useMutation();
  const submitMutation = trpc.pricing.submitDesign.useMutation();
  const archiveMutation = trpc.pricing.archiveDesign.useMutation();
  const busy = saveMutation.isPending || testMutation.isPending || submitMutation.isPending || archiveMutation.isPending;
  const groups = [...new Set(rules.map((rule) => rule.group))];

  const update = (patch: Partial<IndicatorDefinition>) => {
    setForm((current) => ({ ...current, ...patch }));
    setTests(null);
    setTested(false);
    setCustomResult(null);
    if (status === "review") setStatus("draft");
  };
  const updateAssessment = (patch: Partial<IndicatorDefinition["assessment"]>) => update({ assessment: { ...form.assessment, ...patch } });
  const changeMethod = (method: CalcMethod) => update({ method, formula: formulaForMethod(method, form.stockRate !== null) });

  const persist = async (silent = false): Promise<number | null> => {
    try {
      const result = await saveMutation.mutateAsync({ designId: designId ?? undefined, baseVersion, definition: form });
      setDesignId(result.id);
      setStatus("draft");
      refresh();
      if (!silent) notify(`指标 ${form.id} 已保存为设计草稿`);
      return result.id;
    } catch (error) {
      notify(messageOf(error), "error");
      return null;
    }
  };

  const runTests = async () => {
    try {
      const result = await testMutation.mutateAsync({ definition: form });
      setTests(result.results);
      setTested(result.passed);
      if (result.passed) notify("四组场景测试全部通过，可提交复核");
      else notify(result.validation.errors[0] ?? "部分场景测试未通过，请检查公式", "error");
    } catch (error) {
      setTested(false);
      notify(messageOf(error), "error");
    }
  };

  const submitReview = async () => {
    const id = await persist(true);
    if (!id) return;
    try {
      await submitMutation.mutateAsync({ id });
      setStatus("review");
      setTested(true);
      refresh();
      notify("指标已提交复核，服务端已重新验证公式与四组场景");
    } catch (error) {
      notify(messageOf(error), "error");
    }
  };

  const archive = async () => {
    if (!designId) return;
    try {
      await archiveMutation.mutateAsync({ id: designId });
      refresh();
      notify("设计稿已归档，正式指标未受影响");
      setConfirmArchive(false);
      onExit();
    } catch (error) {
      notify(messageOf(error), "error");
    }
  };

  const insertVariable = (code: string) => {
    const textarea = formulaRef.current;
    const start = textarea?.selectionStart ?? form.formula.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${form.formula.slice(0, start)}${code}${form.formula.slice(end)}`;
    update({ formula: next });
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + code.length, start + code.length);
    }, 0);
  };

  const runCustom = () => {
    try {
      const result = calculate(definitionToRule(form), customInput);
      setCustomResult({ score: result.score, expression: result.expression });
      setCustomError("");
    } catch (error) {
      setCustomResult(null);
      setCustomError(messageOf(error));
    }
  };

  return (
    <div className="indicator-editor">
      <div className="editor-head">
        <div><button className="text-button" onClick={onExit}><ArrowLeft size={17} />返回指标台账</button><div className="editor-title"><h1>{form.name || "新建计价指标"}</h1><span className={`status-badge ${status === "review" ? "success" : "warning"}`}>{status === "review" ? "待复核" : "设计草稿"}</span></div><p>{form.id} · 目标版本 V{baseVersion + 1} {baseVersion > 0 ? `· 当前正式 V${baseVersion} 在发布前保持有效` : "· 新指标发布后才进入正式试算"}</p></div>
        <div className="editor-head-actions">{designId && <button className="button secondary" onClick={() => setConfirmArchive(true)} disabled={busy}><Archive size={16} />归档</button>}<button className="button primary" onClick={() => persist()} disabled={busy}><Save size={16} />{saveMutation.isPending ? "保存中…" : "保存草稿"}</button></div>
      </div>

      <div className="design-stepper" aria-label="指标设计步骤">{STEPS.map((label, index) => <button key={label} className={step === index ? "active" : step > index ? "done" : ""} onClick={() => setStep(index)} aria-current={step === index ? "step" : undefined}><span>{step > index ? <Check size={14} /> : index + 1}</span><strong>{label}</strong></button>)}</div>

      <div className="designer-workspace">
        <section className="panel design-form-panel">
          {step === 0 && <div className="design-section">
            <div className="section-heading"><span>基本定义</span><h2>先把指标说清楚</h2><p>编码是全系统唯一主键；取数M码、积分M码与责任边界随版本一并保存。</p></div>
            <div className="form-grid two"><label>指标编码<input value={form.id} disabled={Boolean(designId) || baseVersion > 0} onChange={(event) => update({ id: event.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="如 N001" maxLength={32} /></label><label>指标名称<input value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="输入完整业务名称" maxLength={160} /></label></div>
            <div className="form-grid three section-fields"><label>指标分类<select value={form.category} onChange={(event) => update({ category: event.target.value as IndicatorDefinition["category"] })}><option>利润</option><option>规模</option><option>客户</option></select></label><label>业务分组<input list="indicator-groups" value={form.group} onChange={(event) => update({ group: event.target.value })} /><datalist id="indicator-groups">{groups.map((group) => <option key={group} value={group} />)}</datalist></label><label>计价单位<select value={form.unit} onChange={(event) => update({ unit: event.target.value as IndicatorDefinition["unit"] })}><option>元/万元</option><option>元/户</option><option>元/笔</option></select></label></div>
            <div className="form-grid two section-fields"><label>责任部门<input value={form.department} onChange={(event) => update({ department: event.target.value })} /></label><label>责任人 / 责任岗位<input value={form.owner} onChange={(event) => update({ owner: event.target.value })} /></label></div>
            <label className="field">指标业务定义<textarea rows={3} value={form.description} onChange={(event) => update({ description: event.target.value })} placeholder="说明指标统计范围、业务边界及与近似指标的区别" /></label>
            <div className="subsection-title"><Braces size={17} /><div><h3>取数关联</h3><p>未连接生产源系统前，仅保存取数映射，用于后续接口核对。</p></div></div>
            <div className="form-grid three"><label>源系统 / 数据表<input value={form.sourceSystem} onChange={(event) => update({ sourceSystem: event.target.value })} /></label><label>取数M码 / _p科目<input value={form.sourceCode} onChange={(event) => update({ sourceCode: event.target.value })} placeholder="如 M9992001" /></label><label>积分 / 展示M码<input value={form.metricCode} onChange={(event) => update({ metricCode: event.target.value })} placeholder="如 M9992002" /></label></div>
            <div className="form-grid two section-fields"><label>源数据单位<select value={form.sourceUnit} onChange={(event) => { const sourceUnit = event.target.value as IndicatorDefinition["sourceUnit"]; update({ sourceUnit, unitFactor: sourceUnit === "元" ? 10000 : 1 }); }}><option>元</option><option>万元</option><option>户</option><option>笔</option></select></label><label>单位换算除数<input type="number" min="0.000001" step="1" value={form.unitFactor} onChange={(event) => update({ unitFactor: Number(event.target.value) })} /></label></div>
            <div className="notice-box"><Info size={17} /><p>公式通过 UNIT_FACTOR 引用该除数。源数据为元且计价按万元时填10000；万元、户、笔通常填1。</p></div>
          </div>}

          {step === 1 && <div className="design-section">
            <div className="section-heading"><span>计算与单价</span><h2>选择算法，再定价格</h2><p>切换算法会生成对应公式模板；后续可在“公式设计”中继续调整。</p></div>
            <div className="method-selector">{(Object.entries(METHOD_LABELS) as Array<[CalcMethod, string]>).map(([method, label]) => <button key={method} className={form.method === method ? "active" : ""} onClick={() => changeMethod(method)}><span>{form.method === method ? <CheckCircle2 size={18} /> : <span className="method-radio" />}</span><strong>{label}</strong><small>{method === "direct" ? "当月值 × 适用单价" : method === "stock_monthly" ? "年初存量 ÷ 12 × 单价" : method === "weighted_growth" ? "自动注入 n 与 n−1" : method === "quarterly_growth" ? "季度日均差 ÷ 3" : "白名单变量自由组合"}</small></button>)}</div>
            <div className="form-grid three section-fields"><label>存量 / 总量单价<input type="number" min="0" step="0.01" value={form.stockRate ?? ""} onChange={(event) => update({ stockRate: nullableNumber(event.target.value) })} placeholder="未设置" /></label><label>正增单价<input type="number" min="0" step="0.01" value={form.positiveRate ?? ""} onChange={(event) => update({ positiveRate: nullableNumber(event.target.value) })} placeholder="未设置" /></label><label>负增扣减单价<input type="number" min="0" step="0.01" value={form.negativeRate ?? ""} onChange={(event) => update({ negativeRate: nullableNumber(event.target.value) })} placeholder="未设置" /></label></div>
            <div className="rate-rule"><span>单价单位</span><strong>{form.unit}</strong><i /><span>负增单价按正数录入，公式根据业务方向决定扣减。</span></div>
            {form.positiveRate !== null && form.negativeRate !== null && form.negativeRate > form.positiveRate && <p className="form-error"><CircleAlert size={15} />负增扣减单价高于正增单价，请核对制度依据。</p>}
            <div className="formula-preview"><span>当前算法公式模板</span><code>{form.formula}</code></div>
          </div>}

          {step === 2 && <div className="design-section">
            <div className="section-heading"><span>公式设计</span><h2>公式可配置，也可被检查</h2><p>支持四则运算、比较、条件分支与白名单函数；不支持对象访问、脚本或任意函数调用。</p></div>
            <div className="formula-toolbar"><div><strong>可用变量</strong><span>点击插入公式</span></div><button className="button secondary" onClick={() => update({ formula: formulaForMethod(form.method, form.stockRate !== null) })}><Braces size={16} />按算法重建</button></div>
            <div className="variable-palette">{FORMULA_VARIABLES.map((variable) => <button key={variable.code} onClick={() => insertVariable(variable.code)} title={variable.detail}><code>{variable.code}</code><span>{variable.label}</span></button>)}</div>
            <label className="field formula-editor-label">计价公式<textarea ref={formulaRef} className="formula-textarea" rows={8} spellCheck={false} value={form.formula} onChange={(event) => update({ formula: event.target.value })} placeholder="例如 DIRECT / UNIT_FACTOR * POS_RATE" /></label>
            <div className={`formula-validation ${validation.errors.length ? "has-error" : "is-valid"}`}>{validation.errors.length ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}<div><strong>{validation.errors.length ? `${validation.errors.length}项配置问题待处理` : "公式语法与当前配置检查通过"}</strong>{validation.errors.length ? <ul>{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul> : <p>已引用 {validation.variables.length} 个变量：{validation.variables.join("、") || "无"}</p>}</div></div>
            <div className="function-guide"><div><strong>条件与函数</strong><p><code>IF(条件, 成立结果, 不成立结果)</code> · <code>条件 ? 结果A : 结果B</code></p><p><code>MIN(...)</code> <code>MAX(...)</code> <code>ROUND(数值, 小数位)</code> <code>ABS(数值)</code></p></div><div><strong>时间进度示例</strong><p><code>(CUR - OPEN) * MONTH / 12 - (PREV - OPEN) * (MONTH - 1) / 12</code></p><p>月份由期间注入，不在公式里写死。</p></div></div>
            {validation.warnings.length > 0 && <div className="warning-list"><strong>需要人工确认</strong>{validation.warnings.map((warning) => <p key={warning}><Info size={14} />{warning}</p>)}</div>}
          </div>}

          {step === 3 && <div className="design-section">
            <div className="section-heading"><span>考核细则</span><h2>把“怎么考”写成制度</h2><p>计算结果之外，明确目标、权重、适用对象、边界处理、复核要求与生效期间。</p></div>
            <div className="form-grid three"><label>考核周期<select value={form.assessment.cycle} onChange={(event) => updateAssessment({ cycle: event.target.value as IndicatorDefinition["assessment"]["cycle"] })}><option>月度</option><option>季度</option><option>年度</option><option>按批次</option></select></label><label>目标值（可选）<input type="number" step="0.01" value={form.assessment.targetValue ?? ""} onChange={(event) => updateAssessment({ targetValue: nullableNumber(event.target.value) })} placeholder="不设目标" /></label><label>考核权重 %（可选）<input type="number" min="0" max="100" step="0.01" value={form.assessment.weight ?? ""} onChange={(event) => updateAssessment({ weight: nullableNumber(event.target.value) })} placeholder="不占权重" /></label></div>
            <div className="form-grid three section-fields"><label>积分封顶（可选）<input type="number" step="0.01" value={form.assessment.cap ?? ""} onChange={(event) => updateAssessment({ cap: nullableNumber(event.target.value) })} placeholder="不封顶" /></label><label>积分保底（可选）<input type="number" step="0.01" value={form.assessment.floor ?? ""} onChange={(event) => updateAssessment({ floor: nullableNumber(event.target.value) })} placeholder="不保底" /></label><label>结果小数位<input type="number" min="0" max="6" step="1" value={form.assessment.precision} onChange={(event) => updateAssessment({ precision: Number(event.target.value) })} /></label></div>
            <div className="form-grid two section-fields"><label>舍入方式<select value={form.assessment.rounding} onChange={(event) => updateAssessment({ rounding: event.target.value as IndicatorDefinition["assessment"]["rounding"] })}><option>四舍五入</option><option>向下取整</option><option>向上取整</option></select></label><label>业绩归属方式<select value={form.assessment.attribution} onChange={(event) => updateAssessment({ attribution: event.target.value as IndicatorDefinition["assessment"]["attribution"] })}><option>主办优先</option><option>按比例分润</option><option>机构归属</option></select></label></div>
            <div className="form-grid two section-fields"><label>适用机构<textarea rows={2} value={form.assessment.applicableOrgs} onChange={(event) => updateAssessment({ applicableOrgs: event.target.value })} /></label><label>适用岗位 / 人员身份<textarea rows={2} value={form.assessment.applicableRoles} onChange={(event) => updateAssessment({ applicableRoles: event.target.value })} /></label></div>
            <div className="form-grid two section-fields"><label>生效日期<input type="date" value={form.assessment.effectiveFrom} onChange={(event) => updateAssessment({ effectiveFrom: event.target.value })} /></label><label>失效日期<input type="date" value={form.assessment.effectiveTo} onChange={(event) => updateAssessment({ effectiveTo: event.target.value })} /></label></div>
            <div className="form-grid two section-fields"><label>复核流程<select value={form.assessment.reviewFlow} onChange={(event) => updateAssessment({ reviewFlow: event.target.value as IndicatorDefinition["assessment"]["reviewFlow"] })}><option>一级复核</option><option>两级复核</option></select></label><div className="switch-group"><label className="switch-field"><input type="checkbox" checked={form.assessment.allowNegative} onChange={(event) => updateAssessment({ allowNegative: event.target.checked })} /><span><strong>允许负积分 / 扣减</strong><small>关闭后，负结果按0处理</small></span></label><label className="switch-field"><input type="checkbox" checked={form.assessment.evidenceRequired} onChange={(event) => updateAssessment({ evidenceRequired: event.target.checked })} /><span><strong>入账需业务凭证</strong><small>复核时检查取数与业务依据</small></span></label></div></div>
            <label className="field">考核与计提细则<textarea rows={4} value={form.assessment.description} onChange={(event) => updateAssessment({ description: event.target.value })} placeholder="例如：按当月净增户数计价，月末取数；经机构复核、部门确认后计入当月绩效。跨月冲正按原期间追溯。" /></label>
            <label className="field">排除项、冲正与补录规则<textarea rows={3} value={form.assessment.exclusions} onChange={(event) => updateAssessment({ exclusions: event.target.value })} /></label>
          </div>}

          {step === 4 && <div className="design-section">
            <div className="section-heading"><span>测试与提交</span><h2>先核对计算，再提交复核</h2><p>提交时，服务端会重新校验配置并运行测试；复核人员独立复测后才能发布。</p></div>
            <div className="release-checks"><div className={validation.errors.length === 0 ? "pass" : "fail"}>{validation.errors.length === 0 ? <Check size={17} /> : <CircleAlert size={17} />}<span><strong>配置完整性</strong><small>{validation.errors.length === 0 ? "编码、公式、细则与期间检查通过" : `${validation.errors.length}项问题必须处理`}</small></span></div><div className={tested ? "pass" : ""}><FlaskConical size={17} /><span><strong>四组场景回归</strong><small>{tested ? "正向、负向、零值、一月进度均通过" : "修改配置后须重新运行"}</small></span></div><div className={status === "review" ? "pass" : ""}><ShieldCheck size={17} /><span><strong>独立复核</strong><small>{status === "review" ? "已提交，等待复核人员处理" : "测试通过后提交复核"}</small></span></div></div>
            <div className="test-head"><div><h3>标准场景测试</h3><p>使用统一业务样例比较结果，异常会阻断提交。</p></div><button className="button secondary" onClick={runTests} disabled={busy}><FlaskConical size={16} />{testMutation.isPending ? "测试中…" : "运行四组测试"}</button></div>
            <div className="test-table-wrap"><table className="test-table"><thead><tr><th>场景</th><th>关键输入</th><th>结果</th><th>状态</th></tr></thead><tbody>{TEST_INPUTS.map(({ name, input }, index) => { const result = tests?.[index]; return <tr key={name}><td><strong>{name}</strong></td><td><code>n={input.month}；当月={input.directValue}；年初={input.opening}；现值={input.current}；上月={input.previous}</code></td><td className="number">{result ? result.passed ? <strong>{result.score?.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 积分</strong> : <span className="negative">{result.error}</span> : <span className="muted">待运行</span>}</td><td>{result ? <span className={`status-badge ${result.passed ? "success" : "warning"}`}>{result.passed ? "通过" : "失败"}</span> : <span className="status-badge">未测试</span>}</td></tr>; })}</tbody></table></div>
            <div className="custom-test"><div className="subsection-title"><FlaskConical size={17} /><div><h3>补充边界试算</h3><p>可修改业务值，验证本指标的特殊场景；结果仅用于设计验证。</p></div></div><div className="form-grid five"><label>月份 n<input type="number" min="1" max="12" value={customInput.month} onChange={(event) => setCustomInput({ ...customInput, month: Number(event.target.value) })} /></label><label>当月业务值<input type="number" step="0.01" value={customInput.directValue} onChange={(event) => setCustomInput({ ...customInput, directValue: Number(event.target.value) })} /></label><label>年初值<input type="number" step="0.01" value={customInput.opening} onChange={(event) => setCustomInput({ ...customInput, opening: Number(event.target.value) })} /></label><label>当月值<input type="number" step="0.01" value={customInput.current} onChange={(event) => setCustomInput({ ...customInput, current: Number(event.target.value) })} /></label><label>上月值<input type="number" step="0.01" value={customInput.previous} onChange={(event) => setCustomInput({ ...customInput, previous: Number(event.target.value) })} /></label></div><button className="text-button" onClick={runCustom}>运行补充试算<ChevronRight size={15} /></button>{customResult && <div className="custom-result"><strong>{customResult.score.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} 积分</strong><code>{customResult.expression}</code></div>}{customError && <p className="form-error"><CircleAlert size={15} />{customError}</p>}</div>
            {validation.errors.length > 0 && <div className="formula-validation has-error"><CircleAlert size={18} /><div><strong>提交前必须处理</strong><ul>{validation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
            <div className="release-action">{status === "draft" ? <><div><strong>确认配置与测试结果后提交复核</strong><p>提交后仍可由复核人员退回修改；任何修改都会使其重新变为草稿。</p></div><button className="button primary" disabled={!tested || validation.errors.length > 0 || busy} onClick={submitReview}><Send size={16} />{submitMutation.isPending ? "提交中…" : "保存并提交复核"}</button></> : <><div><strong>已提交，等待独立复核人员处理</strong><p>复核人员将核对定义、公式和考核细则，并独立复测后发布或退回。管理员不能在本人页面直接发布。</p></div><button className="button secondary" onClick={onExit}><Check size={16} />返回指标台账</button></>}</div>
          </div>}

          <div className="design-form-footer"><button className="button secondary" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft size={16} />上一步</button><span>第 {step + 1} / {STEPS.length} 步</span>{step < STEPS.length - 1 ? <button className="button secondary" onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}>下一步<ChevronRight size={16} /></button> : <button className="button secondary" onClick={() => setStep(0)}>返回基本定义<ChevronRight size={16} /></button>}</div>
        </section>

        <aside className="design-inspector">
          <section className="panel inspector-summary"><span className="inspector-label">版本摘要</span><div className="inspector-code"><strong>{form.id}</strong><span>V{baseVersion + 1}</span></div><h3>{form.name || "待命名指标"}</h3><dl><div><dt>分类 / 分组</dt><dd>{form.category} · {form.group || "—"}</dd></div><div><dt>计算方式</dt><dd>{METHOD_LABELS[form.method]}</dd></div><div><dt>考核周期</dt><dd>{form.assessment.cycle} · {form.assessment.reviewFlow}</dd></div><div><dt>生效期间</dt><dd>{form.assessment.effectiveFrom}<br />至 {form.assessment.effectiveTo}</dd></div></dl></section>
          <section className="panel inspector-rates"><span className="inspector-label">单价速览 · {form.unit}</span><div><span>存量 / 总量<strong>{form.stockRate ?? "—"}</strong></span><span>正增长<strong className="positive">{form.positiveRate ?? "—"}</strong></span><span>负增长<strong className="negative">{form.negativeRate ?? "—"}</strong></span></div></section>
          <section className={`panel inspector-status ${validation.errors.length ? "has-issues" : ""}`}><span className="inspector-label">实时检查</span><div><strong>{validation.errors.length}</strong><span>项阻断问题</span></div><p>{validation.warnings.length} 项人工确认提示 · {validation.variables.length} 个公式变量</p>{validation.errors.slice(0, 3).map((error) => <small key={error}>{error}</small>)}{validation.errors.length === 0 && <small className="success-text"><Check size={13} />当前配置可进入场景测试</small>}</section>
          <div className="notice-box"><Info size={17} /><p>{baseVersion ? `正式 V${baseVersion} 在本设计发布前持续有效。` : "新指标仅保存为设计稿，不会提前出现在正式试算中。"}所有提交、发布与归档均写入操作日志。</p></div>
        </aside>
      </div>

      {confirmArchive && <DesignerModal title="归档指标设计稿" onClose={() => setConfirmArchive(false)}><div className="confirm-content"><Archive size={36} /><p>归档仅结束本次设计流程，不删除记录，也不会修改当前正式指标。归档后如需继续，请重新创建版本。</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmArchive(false)}>取消</button><button className="button primary" onClick={archive} disabled={archiveMutation.isPending}>确认归档</button></div></DesignerModal>}
    </div>
  );
}
