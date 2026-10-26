import { useState } from "react";
import { Check, CircleAlert, KeyRound, Pencil, Plus, Search, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { ROLE_DEFINITIONS, ROLE_IDS, type AccessUser, type ManagedAccount, type RoleId } from "@contracts/access";
import { DesignerModal } from "./DesignerModal";

type Notify = (message: string, tone?: "success" | "error") => void;
type AccountForm = {
  id?: number;
  username: string;
  employeeId: string;
  name: string;
  role: RoleId;
  branch: string;
  position: string;
  status: "active" | "disabled";
  password: string;
};

const emptyForm: AccountForm = { username: "", employeeId: "", name: "", role: "employee", branch: "", position: "", status: "active", password: "" };
const dateText = (value: Date | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未登录";

export function AccountCenter({ currentUser, notify }: { currentUser: AccessUser; notify: Notify }) {
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<AccountForm | null>(null);
  const accounts = trpc.auth.listUsers.useQuery();
  const utils = trpc.useUtils();
  const completed = (message: string) => {
    setForm(null);
    utils.auth.listUsers.invalidate();
    utils.pricing.workspace.invalidate();
    notify(message);
  };
  const create = trpc.auth.createUser.useMutation({ onSuccess: () => completed("账号已新增，可使用初始密码登录"), onError: (error) => notify(error.message, "error") });
  const update = trpc.auth.updateUser.useMutation({ onSuccess: () => completed("账号权限已调整，该账号原会话已注销"), onError: (error) => notify(error.message, "error") });
  const rows = (accounts.data ?? []).filter((account) => `${account.name}${account.username}${account.employeeId}${account.branch}${ROLE_DEFINITIONS[account.role].label}`.toLowerCase().includes(query.toLowerCase()));

  const submit = () => {
    if (!form) return;
    if (form.id) update.mutate({ id: form.id, name: form.name, role: form.role, branch: form.branch, position: form.position, status: form.status });
    else create.mutate({ username: form.username, employeeId: form.employeeId, name: form.name, role: form.role, branch: form.branch, position: form.position, password: form.password });
  };
  const valid = form && form.name.trim().length >= 2 && form.branch.trim().length >= 2 && form.position.trim().length >= 2 && (form.id ? true : form.username.length >= 3 && form.employeeId.length >= 2 && form.password.length >= 10);

  return (
    <div className="account-center">
      <div className="page-head"><div><span className="eyebrow">账号与权限</span><h1>按岗位授权，按机构查数。</h1><p>账号角色决定可办理事项，机构范围决定可查看的数据；所有变更会注销原会话并写入操作记录。</p></div><div className="page-actions"><button className="button primary" onClick={() => setForm(emptyForm)}><Plus size={17} />新增账号</button></div></div>

      <section className="access-summary"><div><UsersRound size={20} /><span>平台账号<strong>{accounts.data?.length ?? 0}</strong><small>个</small></span></div><div><ShieldCheck size={20} /><span>启用账号<strong>{accounts.data?.filter((item) => item.status === "active").length ?? 0}</strong><small>个</small></span></div><div><KeyRound size={20} /><span>岗位角色<strong>6</strong><small>类</small></span></div><p>管理员不能修改自己的角色或停用自己，避免当前管理员误操作导致失去管理入口。</p></section>

      <section className="panel table-panel">
        <div className="filter-bar"><label className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、账号、员工编号、机构或角色" /><kbd>{rows.length}</kbd></label><span className="table-scope-note">当前操作人：{currentUser.name} · {ROLE_DEFINITIONS[currentUser.role].label}</span></div>
        {accounts.isLoading ? <div className="empty-inline"><p>正在读取账号…</p></div> : accounts.error ? <div className="empty-inline"><CircleAlert size={24} /><p>{accounts.error.message}</p><button className="text-button" onClick={() => accounts.refetch()}>重新加载</button></div> : <div className="table-scroll"><table className="data-table account-table"><thead><tr><th>人员与账号</th><th>岗位角色</th><th>所属机构 / 数据范围</th><th>账号状态</th><th>最近登录</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{rows.map((account) => <tr key={account.id}><td><strong>{account.name}{account.id === currentUser.id && <span className="status-badge">当前账号</span>}</strong><small>{account.username} · {account.employeeId} · {account.position}</small></td><td><span>{ROLE_DEFINITIONS[account.role].label}</span></td><td><strong>{account.branch}</strong><small>{ROLE_DEFINITIONS[account.role].scopeLabel}</small></td><td><span className={`status-badge ${account.status === "active" ? "success" : "warning"}`}>{account.status === "active" ? "启用" : "已停用"}</span></td><td><span className="date-cell">{dateText(account.lastLoginAt)}</span></td><td><button className="text-button" disabled={account.id === currentUser.id} onClick={() => openEdit(account, setForm)}><Pencil size={14} />{account.id === currentUser.id ? "不可自改" : "调整权限"}</button></td></tr>)}</tbody></table></div>}
        <div className="table-footer"><span>显示 {rows.length} / {accounts.data?.length ?? 0} 个账号</span><span>不展示、不导出密码哈希和会话信息</span></div>
      </section>

      <section className="panel role-matrix"><div className="panel-head padded"><div><h2>六类岗位权限说明</h2><p>角色调整后自动按下表重新计算权限，不需要另行配置菜单</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>岗位</th><th>数据范围</th><th>主要工作</th><th>明确限制</th></tr></thead><tbody>{ROLE_IDS.map((role) => { const definition = ROLE_DEFINITIONS[role]; return <tr key={role}><td><strong>{definition.label}</strong></td><td><span className="status-badge">{definition.scopeLabel}</span></td><td>{definition.description}</td><td>{restrictionFor(role)}</td></tr>; })}</tbody></table></div></section>

      {form && <DesignerModal title={form.id ? `调整账号 · ${form.username}` : "新增平台账号"} onClose={() => setForm(null)} wide><form className="account-form" onSubmit={(event) => { event.preventDefault(); if (valid) submit(); }}>
        {!form.id && <div className="form-grid two"><label>登录账号<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} placeholder="如 zhangsan" /><small>3—32位小写字母、数字或._-</small></label><label>员工编号<input value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value.toUpperCase() })} placeholder="如 E2001" /></label></div>}
        <div className="form-grid two"><label>姓名<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>岗位角色<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as RoleId })}>{ROLE_IDS.map((role) => <option key={role} value={role}>{ROLE_DEFINITIONS[role].label}</option>)}</select></label></div>
        <div className="form-grid two"><label>所属机构<input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} placeholder="如 城东支行" /></label><label>岗位名称<input value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="如 客户经理" /></label></div>
        {form.id ? <label className="field">账号状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "active" | "disabled" })}><option value="active">启用</option><option value="disabled">停用</option></select></label> : <label className="field">初始密码<input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少10位，含大小写字母和数字" /></label>}
        <div className="access-form-note"><UserRound size={18} /><div><strong>{ROLE_DEFINITIONS[form.role].label} · {ROLE_DEFINITIONS[form.role].scopeLabel}</strong><p>{ROLE_DEFINITIONS[form.role].description}</p></div></div>
        {form.id && <div className="notice-box"><CircleAlert size={17} /><p>保存后，该账号现有登录会话将全部注销；再次登录时按新角色和机构范围访问。</p></div>}
        <div className="modal-actions"><button type="button" className="button secondary" onClick={() => setForm(null)}>取消</button><button className="button primary" disabled={!valid || create.isPending || update.isPending}>{create.isPending || update.isPending ? "保存中…" : form.id ? "保存权限调整" : "创建账号"}<Check size={17} /></button></div>
      </form></DesignerModal>}
    </div>
  );
}

function openEdit(account: ManagedAccount, setForm: (form: AccountForm) => void) {
  setForm({ id: account.id, username: account.username, employeeId: account.employeeId, name: account.name, role: account.role, branch: account.branch, position: account.position, status: account.status, password: "" });
}

function restrictionFor(role: RoleId): string {
  if (role === "employee") return "不保存正式批次，不维护规则，不看他人数据";
  if (role === "relationship_manager") return "不保存或审批批次，仅限本人参与的本机构分润";
  if (role === "branch_manager") return "不能跨机构办理，不能审批批次";
  if (role === "executive") return "只读监督，不修改规则、分润和批次状态";
  if (role === "reviewer") return "不修改规则，不保存批次，不审批本人提交内容";
  return "不发布指标、不审批批次，不能修改自己的权限";
}
