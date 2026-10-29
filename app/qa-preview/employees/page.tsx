import { notFound } from "next/navigation";
import { requireRoles } from "@/lib/auth";
import { EmployeesPanel } from "@/components/employees/employees-panel";
import { qaEmployees, qaEmployeeActor } from "@/lib/qa-employee-fixture";

export default async function QaEmployeesPage() {
  if (process.env.MAMITA_QA_BUILD !== "true") notFound();
  await requireRoles(["admin"]);
  return <EmployeesPanel initialEmployees={qaEmployees} actorId={qaEmployeeActor} />;
}
