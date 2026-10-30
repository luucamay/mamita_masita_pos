import { redirect } from "next/navigation";
import { requireRoles } from "@/lib/auth";
import MenuPage from "@/components/menu/menu-page";
export default async function HomePage() {
  const access = await requireRoles(["admin", "staff"]);
  if (access.profile.role === "admin") redirect("/historial");
  return <MenuPage/>;
}
