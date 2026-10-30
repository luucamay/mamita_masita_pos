export const EMPLOYEE_DOMAIN = "@mamita.local";
export function suggestedLogin(name: string) {
  return name.trim().split(/\s+/)[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9._-]/g, "").replace(/^[._-]+|[._-]+$/g, "").replace(/\.{2,}/g, ".").slice(0, 64).replace(/\.$/, "");
}
export function employeeEmail(login: string) {
  const value = login.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value) || value.includes("..") || value.endsWith(".")) throw new Error("Usa un nombre de usuario sin espacios, por ejemplo ana o ana2.");
  return value + EMPLOYEE_DOMAIN;
}
export function generateEmployeePassword() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return Array.from(crypto.getRandomValues(new Uint8Array(18)), n => alphabet[n & 63]).join("") + "7a";
}
export function credentialsMessage(email: string, password: string) {
  return `Mamita Masita\nUsuario: ${email}\nContraseña: ${password}`;
}
