import { useState } from "react";
import { Building2, Check, ChevronRight, CircleAlert, Eye, EyeOff, LockKeyhole, LogIn, ShieldCheck, UserRound } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD, ROLE_DEFINITIONS, type AccessUser, type RoleId } from "@contracts/access";

export function LoginPage({ onSuccess }: { onSuccess: (user: AccessUser) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.auth.login.useMutation({
    onSuccess: (user) => onSuccess(user),
  });

  const chooseAccount = (role: RoleId) => {
    const account = DEMO_ACCOUNTS.find((item) => item.role === role);
    if (!account) return;
    setUsername(account.username);
    setPassword(DEMO_ACCOUNT_PASSWORD);
    login.reset();
  };

  return (
    <main className="login-page">
      <header className="login-brand">
        <div className="brand-mark" aria-hidden="true"><span>计</span></div>
        <div><strong>全产品计价系统</strong><span>员工绩效计价工作台</span></div>
        <span className="login-environment">2026 计价年度 · 功能演示环境</span>
      </header>

      <div className="login-layout">
        <section className="login-form-section" aria-labelledby="login-title">
          <div className="login-heading"><span className="eyebrow">账号登录</span><h1 id="login-title">按岗位进入计价工作台</h1><p>登录后仅显示本人岗位可办理的工作，数据范围同时受服务端限制。</p></div>
          <form className="login-form" onSubmit={(event) => { event.preventDefault(); if (username && password) login.mutate({ username, password }); }}>
            <label>登录账号<div className="login-input"><UserRound size={18} /><input autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); login.reset(); }} placeholder="请输入登录账号" autoFocus /></div></label>
            <label>登录密码<div className="login-input"><LockKeyhole size={18} /><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); login.reset(); }} placeholder="请输入登录密码" /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            {login.error && <p className="login-error" role="alert"><CircleAlert size={17} />{login.error.message}</p>}
            <button className="button primary login-submit" disabled={!username.trim() || !password || login.isPending}>{login.isPending ? "正在校验账号…" : "登录工作台"}{!login.isPending && <LogIn size={18} />}</button>
          </form>
          <div className="demo-credential"><Check size={17} /><p>选择右侧演示角色会填入对应账号。统一演示密码：<code>{DEMO_ACCOUNT_PASSWORD}</code></p></div>
          <div className="login-security"><ShieldCheck size={19} /><p>密码经加密校验，会话保存在服务端并在8小时后过期。连续输错5次将暂停该账号登录15分钟。</p></div>
        </section>

        <section className="login-accounts" aria-labelledby="accounts-title">
          <div className="login-accounts-head"><div><span>演示角色</span><h2 id="accounts-title">六类岗位，六种工作范围</h2></div><span>{DEMO_ACCOUNTS.length} 个账号</span></div>
          <div className="account-choice-list">
            {DEMO_ACCOUNTS.map((account) => {
              const role = ROLE_DEFINITIONS[account.role];
              const selected = username === account.username;
              return <button key={account.username} className={selected ? "selected" : ""} onClick={() => chooseAccount(account.role)} aria-pressed={selected}>
                <span className="account-role-icon">{account.role === "executive" || account.role === "branch_manager" ? <Building2 size={19} /> : <UserRound size={19} />}</span>
                <span><strong>{role.label}<small>{account.name} · {account.username}</small></strong><p>{role.description}</p><em>{role.scopeLabel} · {account.branch}</em></span>
                <ChevronRight size={18} />
              </button>;
            })}
          </div>
        </section>
      </div>

      <footer className="login-footer"><strong>使用边界</strong><p>以上账号仅用于功能演示。正式使用时应接入本行统一身份认证、组织人员主数据及必要的多因素认证；当前版本未宣称已连接这些外部系统。</p></footer>
    </main>
  );
}
