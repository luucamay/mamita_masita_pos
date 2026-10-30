import { requireRoles } from "@/lib/auth";
import { CafeQueue } from "@/components/cafe/cafe-queue";
import { getCafeQueue } from "@/lib/cafe";

export default async function CafePage() {
  const access=await requireRoles(["admin","staff","barista"]);
  const { items, error } = await getCafeQueue(access);

  return (
    <div className="px-3 py-3 sm:px-4">
      <header className="mb-2">
        <h1 className="text-xl font-semibold">Cola de café</h1>
      </header>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar la cola: {error}
        </div>
      ) : (
        <CafeQueue initialItems={items} role={access.profile.role} />
      )}
    </div>
  );
}
