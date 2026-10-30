# Publicación y reversión

Fecha: 30/10/2026. Código en `desarrollo/mejoras-octubre-2026`; backend compartido `idqgwcrczdqvacxneyui`. Esta guía no ejecuta push, merge ni despliegue.

## Configuración de Vercel

Antes de publicar, confirmar el proyecto y dominio reales, rama de producción, directorio raíz y commit seleccionado. El enlace histórico de Vercel no acredita su configuración actual. No se solicitó login ni contraseña PostgreSQL para terminar las pruebas locales.

Framework: Next.js. Node 22.x y pnpm 10.33.0 declarados en `package.json`; validado con Node 22.16.0. Instalación: `pnpm install --frozen-lockfile`. Build de Vercel: `pnpm build`. El directorio de salida normal es `.next`; no subir `.next-qa` ni `.next-release` como artefactos de producción.

| Variable | Uso en Production y Preview |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del Supabase actual del negocio. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de ese proyecto; `NEXT_PUBLIC_SUPABASE_ANON_KEY` es la alternativa compatible. |
| `SUPABASE_SECRET_KEY` | Secreto administrativo solo del servidor: alta/gestión de acceso y contraseña. Nunca usar prefijo `NEXT_PUBLIC_`. |
| `MAMITA_QA_BUILD` | Ausente o `false`. |
| `MAMITA_RELEASE_BUILD` | Ausente en Vercel; solo selecciona la carpeta local de verificación. |
| `MAMITA_ALLOW_SHARED_DB_TESTS` | Ausente o `false`. |
| `MAMITA_BACKUP_READY` | No declarar `true` como si existiera una recuperación integral validada. |

No cargar en Vercel `E2E_*`, archivos `.env.*.local`, exportaciones privadas, contraseñas de pruebas o conexiones PostgreSQL. `.env.admin.local` solo funciona como ayuda en desarrollo/QA; la entrega necesita la variable de servidor explícita.

`pnpm check:release` comprueba los nombres configurados en el entorno del proceso, sin imprimir valores. No consulta ni certifica por sí mismo las variables del panel de Vercel.

## Paquete comprobado

Para verificar localmente sin interferir con `pnpm dev`:

```powershell
pnpm install --frozen-lockfile
pnpm test:p15
pnpm test:preparacion
pnpm test:cashbox:db
pnpm build:qa
pnpm test:p15:ui
pnpm build:release
pnpm test:p15:release
```

QA usa `.next-qa`, puerto 3101 y escrituras de negocio simuladas. Entrega usa `.next-release`, puerto 3102, QA deshabilitado y solo lectura de negocio. Las pruebas Auth usan cuentas exclusivas. La prueba SQL crea un PostgreSQL temporal, sin conectar a producción.

## Publicación coordinada

1. Identificar el commit del paquete y comprobar que no haya cambios sin revisar. Conservar la versión anterior del frontend para una eventual reversión.
2. Confirmar dominio, rama, directorio raíz y variables en Vercel. Un push a la rama conectada puede desplegar automáticamente.
3. No ejecutar `supabase db reset`, seed, `db push` indiscriminado ni reaplicar todo el historial SQL. Las migraciones de la entrega ya están en Supabase; consultar el inventario de P15.
4. Con la publicación autorizada, integrar/publicar el commit seleccionado en la rama configurada. No sustituir el Supabase actual ni cambiar su URL.
5. Verificar en el dominio publicado: login de roles, lectura de menú y pedidos, reportes/Excel, Empleados y Caja. Todas las rutas `/qa-preview/*` deben devolver 404 a un usuario autenticado. No generar ventas ficticias para comprobarlo.
6. Comprobar PWA en los teléfonos reales. Si hay una versión anterior abierta, cerrar/reabrir o actualizar antes de operar.
7. Coordinar la primera apertura real de caja con el personal. Hasta entonces el control queda inactivo; después los cobros requieren turno abierto.
8. Retirar/desactivar las identidades QA por sus UUID del manifiesto privado, una vez terminada la revisión y entregados los accesos definitivos. No borrar cuentas del negocio ni usar coincidencias de nombre. Esa acción no está incluida en una publicación automática.

## Datos y recuperación

Existe copia privada de las tablas públicas y de los seis pedidos manuales retirados con autorización de Omar. Se verificaron los SHA-256. No contiene una recuperación integral PostgreSQL/Auth probada; no se presenta como tal ni exige instalar Supabase local.

No restaurar indiscriminadamente una exportación antigua sobre actividad nueva. Una recuperación debe identificar qué datos faltan, conservar las ventas posteriores y probarse en una instancia separada.

## Reversión compatible

Antes de la primera apertura real, el control nuevo de caja está desactivado y las estructuras adicionales conservan compatibilidad con el frontend anterior. Aun así, mantener los parches de seguridad y comprobar permisos/reportes de la versión elegida.

Después de activar caja, volver solo el código no desactiva sus guardas de base de datos. La versión de reversión debe conservar una interfaz compatible para abrir/recibir/cerrar turnos. No borrar turnos ni modificar ingresos para desbloquear una reversión.

No se revierten migraciones, se restaura un backup, se deshabilitan políticas o se cambian variables sensibles automáticamente como consecuencia de un fallo del frontend. Registrar el fallo, mantener los datos y corregir/publicar una versión compatible.
