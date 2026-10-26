import { TRPCError } from "@trpc/server";
import type { AccessUser } from "@contracts/access";

export type BatchAction = "edit" | "submit" | "return" | "approve";

export type BatchWorkflowRecord = {
  status: string;
  submittedBy: number | null;
  ownerBranch: string;
};

export type AllocationWorkflowRecord = {
  employeeId: string;
  status: string;
};

export function assertBatchAction(batch: BatchWorkflowRecord, action: BatchAction, user: AccessUser) {
  if (action === "submit" || action === "edit") {
    if (batch.status !== "draft") throw new TRPCError({ code: "CONFLICT", message: action === "edit" ? "只有草稿批次可以修改" : "只有草稿批次可以提交复核" });
    if (user.scope === "branch" && batch.ownerBranch !== user.branch) {
      throw new TRPCError({ code: "FORBIDDEN", message: action === "edit" ? "不能修改其他机构的批次" : "不能提交其他机构的批次" });
    }
    return;
  }

  if (batch.status !== "review") {
    throw new TRPCError({
      code: "CONFLICT",
      message: action === "approve" ? "只有复核中的批次可以审批锁定" : "只有复核中的批次可以退回",
    });
  }
  if (batch.submittedBy === user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: action === "approve" ? "提交人不能审批本人提交的批次，请由其他复核人员办理" : "提交人不能退回本人提交的批次，请由其他复核人员办理",
    });
  }
}

export function assertAllocationConfirmation(allocation: AllocationWorkflowRecord, user: AccessUser) {
  if (allocation.employeeId !== user.employeeId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "只能确认本人名下的分润记录，不能代替其他人员确认" });
  }
  if (allocation.status !== "pending") {
    throw new TRPCError({ code: "CONFLICT", message: "该分润记录已确认，请勿重复操作" });
  }
}
