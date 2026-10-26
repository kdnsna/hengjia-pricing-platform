import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { AccessUser } from "@contracts/access";
import { assertAllocationConfirmation, assertBatchAction } from "./workflow";

function makeUser(overrides: Partial<AccessUser> = {}): AccessUser {
  return {
    id: 90,
    username: "reviewer",
    employeeId: "R0001",
    name: "复核人员",
    role: "reviewer",
    branch: "省分行",
    position: "计价复核岗",
    scope: "all",
    permissions: ["batch:approve"],
    ...overrides,
  };
}

function makeBatch(overrides: Partial<Parameters<typeof assertBatchAction>[0]> = {}) {
  return { status: "review", submittedBy: 10, ownerBranch: "城东支行", ...overrides };
}

function captureError(action: () => void) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    return error as TRPCError;
  }
  throw new Error("预期业务校验未触发");
}

describe("批次办理守卫", () => {
  it("允许有权限范围内草稿提交和独立人员复核", () => {
    expect(() => assertBatchAction(makeBatch({ status: "draft" }), "submit", makeUser({ scope: "branch", branch: "城东支行" }))).not.toThrow();
    expect(() => assertBatchAction(makeBatch(), "return", makeUser())).not.toThrow();
    expect(() => assertBatchAction(makeBatch(), "approve", makeUser())).not.toThrow();
  });

  it("仅允许权限范围内草稿修改，复核中及跨机构批次不可编辑", () => {
    expect(() => assertBatchAction(makeBatch({ status: "draft" }), "edit", makeUser({ scope: "branch", branch: "城东支行" }))).not.toThrow();
    expect(captureError(() => assertBatchAction(makeBatch(), "edit", makeUser())).code).toBe("CONFLICT");
    expect(captureError(() => assertBatchAction(makeBatch({ status: "draft" }), "edit", makeUser({ scope: "branch", branch: "高新支行" }))).code).toBe("FORBIDDEN");
  });

  it("只允许草稿提交，拦截跨机构提交", () => {
    expect(captureError(() => assertBatchAction(makeBatch(), "submit", makeUser())).code).toBe("CONFLICT");
    const error = captureError(() => assertBatchAction(makeBatch({ status: "draft" }), "submit", makeUser({ scope: "branch", branch: "高新支行" })));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toMatch(/其他机构/);
  });

  it("提交人不能退回或审批本人批次", () => {
    const user = makeUser({ id: 10 });
    expect(captureError(() => assertBatchAction(makeBatch(), "return", user)).code).toBe("FORBIDDEN");
    expect(captureError(() => assertBatchAction(makeBatch(), "approve", user)).code).toBe("FORBIDDEN");
  });

  it.each(["return", "approve"] as const)("%s 仅允许复核中批次，锁定后不可再办理", (action) => {
    expect(captureError(() => assertBatchAction(makeBatch({ status: "draft" }), action, makeUser())).code).toBe("CONFLICT");
    expect(captureError(() => assertBatchAction(makeBatch({ status: "locked" }), action, makeUser())).code).toBe("CONFLICT");
  });
});

describe("本人分润确认守卫", () => {
  it("允许确认本人待确认记录", () => {
    expect(() => assertAllocationConfirmation({ employeeId: "R0001", status: "pending" }, makeUser())).not.toThrow();
  });

  it("管理员和同事也不能代替归属人确认", () => {
    const error = captureError(() => assertAllocationConfirmation({ employeeId: "E1086", status: "pending" }, makeUser({ role: "pricing_admin" })));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toMatch(/只能确认本人/);
  });

  it("已确认记录不能重复确认", () => {
    const error = captureError(() => assertAllocationConfirmation({ employeeId: "R0001", status: "approved" }, makeUser()));
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toMatch(/已确认/);
  });
});
