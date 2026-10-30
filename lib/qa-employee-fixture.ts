import type { Employee } from "./employee-provision";
export const qaEmployeeActor = "00000000-0000-4000-8000-000000005001";
export const qaEmployees: Employee[] = [
  { id: qaEmployeeActor, full_name: "Administradora QA", email: "admin@example.test", role: "admin", active: true, updated_at: "2026-10-29T12:00:00Z" },
  { id: "00000000-0000-4000-8000-000000005002", full_name: "Atención QA", email: "atencion@example.test", role: "staff", active: true, updated_at: "2026-10-29T12:00:00Z" },
  { id: "00000000-0000-4000-8000-000000005003", full_name: "Barista QA", email: "barista@example.test", role: "barista", active: false, updated_at: "2026-10-29T12:00:00Z" },
];
