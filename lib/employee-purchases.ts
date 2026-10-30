import { normalizeOrderSnapshot, type OrderSnapshot, type EditableOrder } from "./order-edit";
export type EmployeePurchaseOrder = EditableOrder & { purchase_type: "employee"; buyer_employee_id: string; buyer_name?: string | null; buyer_active?: boolean; employee_cancelled_at: string | null };
export type EmployeePurchase = { order: EmployeePurchaseOrder; items: OrderSnapshot["items"] };
export type PurchaseHistory = { purchases: EmployeePurchase[]; has_more: boolean };
export function normalizeEmployeePurchase(value: Parameters<typeof normalizeOrderSnapshot>[0]): EmployeePurchase {
  const normalized=normalizeOrderSnapshot(value);
  if(value.order.purchase_type!=="employee"||typeof value.order.buyer_employee_id!=="string")throw new Error("No se pudo verificar la compra personal.");
  return normalized as EmployeePurchase;
}
export function normalizePurchaseHistory(value: { purchases: Parameters<typeof normalizeEmployeePurchase>[0][]; has_more: boolean }): PurchaseHistory {
  return { purchases: value.purchases.map(normalizeEmployeePurchase), has_more: value.has_more===true };
}
export function employeePurchaseState(order: Pick<EmployeePurchaseOrder,"employee_cancelled_at"|"paid_at">) { return order.employee_cancelled_at ? "cancelled" : order.paid_at ? "paid" : "pending"; }
export function purchaseReference(number: string) { return number.startsWith("EMP-") ? number.slice(0,12) : number; }
