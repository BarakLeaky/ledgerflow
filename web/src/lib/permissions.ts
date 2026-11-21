export type Role = "owner" | "administrator" | "finance_manager" | "accountant" | "staff" | "approver" | "auditor" | "support";
const P = {
  owner: ["*"],
  administrator: ["member.manage", "integration.manage", "invoice.read", "invoice.create", "report.export"],
  finance_manager: ["invoice.read", "invoice.create", "invoice.issue", "payment.record", "payment.allocate", "expense.approve", "reconciliation.confirm", "report.export"],
  accountant: ["invoice.read", "journal.post", "reconciliation.confirm", "report.export"],
  staff: ["invoice.read", "invoice.create"],
  approver: ["expense.approve"],
  auditor: ["invoice.read", "report.export"],
  support: [],
} as const satisfies Record<Role, readonly string[]>;

/** Deny by default. Always call this in server actions/use cases, never only hide buttons. */
export function can(role: string, permission: string): boolean {
  const list = (P as Record<string, readonly string[]>)[role] ?? [];
  return list.includes("*") || list.includes(permission);
}
