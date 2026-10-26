export const ROLE_IDS = ["employee", "relationship_manager", "branch_manager", "executive", "reviewer", "pricing_admin"] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export type DataScope = "self" | "branch" | "all";
export type AccountStatus = "active" | "disabled";

export type Permission =
  | "rules:manage"
  | "design:view"
  | "design:test"
  | "design:manage"
  | "design:publish"
  | "batch:save"
  | "batch:submit"
  | "batch:approve"
  | "batch:view"
  | "allocation:manage"
  | "validation:view"
  | "logs:view"
  | "blueprint:view"
  | "accounts:manage";

export type AccessUser = {
  id: number;
  username: string;
  employeeId: string;
  name: string;
  role: RoleId;
  branch: string;
  position: string;
  scope: DataScope;
  permissions: Permission[];
};

export type ManagedAccount = AccessUser & {
  status: AccountStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
};

export const ROLE_DEFINITIONS: Record<RoleId, {
  label: string;
  shortLabel: string;
  scope: DataScope;
  scopeLabel: string;
  description: string;
  permissions: Permission[];
}> = {
  employee: {
    label: "普通员工",
    shortLabel: "员工",
    scope: "self",
    scopeLabel: "本人数据",
    description: "查看并确认本人分润记录，核对正式规则和进行本人试算；不能保存正式批次或维护规则。",
    permissions: [],
  },
  relationship_manager: {
    label: "客户经理",
    shortLabel: "客户经理",
    scope: "self",
    scopeLabel: "本人数据",
    description: "在员工权限基础上，可登记本人参与的本机构协同分润；不能保存或审批正式批次。",
    permissions: ["allocation:manage"],
  },
  branch_manager: {
    label: "机构负责人",
    shortLabel: "负责人",
    scope: "branch",
    scopeLabel: "本机构数据",
    description: "查看本机构批次和人员分润，保存并提交本机构试算批次；不能审批批次。",
    permissions: ["batch:save", "batch:submit", "batch:view", "allocation:manage"],
  },
  executive: {
    label: "分行领导",
    shortLabel: "领导",
    scope: "all",
    scopeLabel: "全行数据",
    description: "查看全行规则、批次、操作记录和建设方案，以经营管理与监督查看为主。",
    permissions: ["batch:view", "logs:view", "blueprint:view"],
  },
  reviewer: {
    label: "复核人员",
    shortLabel: "复核",
    scope: "all",
    scopeLabel: "全行数据",
    description: "独立复测并发布待复核指标，审批锁定批次；不能修改规则或保存试算批次。",
    permissions: ["design:view", "design:test", "design:publish", "batch:approve", "batch:view", "validation:view", "logs:view"],
  },
  pricing_admin: {
    label: "计价管理员",
    shortLabel: "管理员",
    scope: "all",
    scopeLabel: "全行数据",
    description: "维护规则、设计指标、保存和提交批次、管理账号；指标发布与批次审批由复核人员办理。",
    permissions: ["rules:manage", "design:view", "design:test", "design:manage", "batch:save", "batch:submit", "batch:view", "allocation:manage", "validation:view", "logs:view", "blueprint:view", "accounts:manage"],
  },
};

export const DEMO_ACCOUNT_PASSWORD = "Hengjia@2026";

export const DEMO_ACCOUNTS: Array<{
  username: string;
  employeeId: string;
  name: string;
  role: RoleId;
  branch: string;
  position: string;
}> = [
  { username: "employee", employeeId: "E1086", name: "周明远", role: "employee", branch: "城东支行", position: "理财经理" },
  { username: "manager", employeeId: "E1027", name: "林书言", role: "relationship_manager", branch: "城东支行", position: "客户经理" },
  { username: "branch", employeeId: "M2001", name: "陈嘉宁", role: "branch_manager", branch: "城东支行", position: "网点负责人" },
  { username: "leader", employeeId: "L0001", name: "王建国", role: "executive", branch: "省分行", position: "分管行领导" },
  { username: "reviewer", employeeId: "R0001", name: "刘文静", role: "reviewer", branch: "省分行", position: "计价复核岗" },
  { username: "admin", employeeId: "A0001", name: "张海峰", role: "pricing_admin", branch: "省分行", position: "计价管理岗" },
];

export function permissionsForRole(role: RoleId): Permission[] {
  return ROLE_DEFINITIONS[role].permissions;
}

export function hasPermission(user: Pick<AccessUser, "permissions">, permission: Permission): boolean {
  return user.permissions.includes(permission);
}

export function isRoleId(value: string): value is RoleId {
  return (ROLE_IDS as readonly string[]).includes(value);
}
