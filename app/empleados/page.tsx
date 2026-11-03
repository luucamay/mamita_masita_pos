import { requireRoles } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { EmployeeError } from "@/lib/employee-provision";
import { EmployeesPanel } from "@/components/employees/employees-panel";

export default async function EmployeesPage() {
  const access = await requireRoles(["admin"]);
  const appOrigin=process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    const data = await listEmployees();
    return <EmployeesPanel initialEmployees={data.employees} actorId={data.actorId} appOrigin={appOrigin} />;
  } catch (error) {
    return <EmployeesPanel initialEmployees={[]} actorId={access.userId} appOrigin={appOrigin} initialError={error instanceof EmployeeError ? error.message : "No se pudieron cargar los empleados. Intenta actualizar."} />;
  }
}
