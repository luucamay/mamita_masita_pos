# P02 — Buscador de productos y revisión de navegación

| Elemento | Resultado al 29/10/2026 |
| --- | --- |
| Rama | `desarrollo/mejoras-octubre-2026` |
| Entrega | Buscador y mejoras de respuesta preparados localmente |
| Base de datos | Sin migraciones nuevas ni escrituras de negocio |
| Pruebas | 4 escenarios P02 y 8 de acceso P01 comprobados; 7 pruebas de lógica P01 aprobadas |
| Precio real / permisos Data API | No se efectuaron cambios sobre productos reales; validación completa pendiente del destino con recuperación y P01 aplicado |
| Publicación | Sin push ni despliegue |

Omar autorizó continuar a P02 y revisar la demora entre pestañas. Esto permite el avance local solicitado; no acredita que la migración P01 esté aplicada ni que hayan terminado sus pruebas de escritura por Data API. P03 no se inició.

## Qué se implementó

| Función | Archivos |
| --- | --- |
| Búsqueda por nombre y categoría, insensible a mayúsculas/tildes, términos múltiples | `components/menu/menu-admin.tsx` |
| Cantidad de coincidencias, resultado vacío, limpiar y recuperar foco | Mismo componente |
| Mostrar productos inactivos y precio en Bs | Mismo componente |
| Conservar borrador al filtrar; mostrar producto en edición; cancelar explícitamente | Mismo componente |
| Guardar solo el UUID seleccionado y confirmar el precio devuelto por la API | Mismo componente |
| Validación de precio no vacío/no negativo, hasta dos decimales; aceptar coma o punto | Mismo componente y `lib/money.ts` existente |
| Tabla contenida en móvil, scroll horizontal y mayor espacio para productos en escritorio | Mismo componente |
| Suprimir lectura duplicada de perfil en middleware para páginas protegidas | `middleware.ts` |
| Centralizar el acceso del administrador del menú | `app/menu-admin/page.tsx` |
| Evitar repetir carga inicial del rol por INITIAL_SESSION y evitar vaciar navegación al refrescar sesión | `components/app-shell.tsx` |
| Estado de carga de rutas y preparación parcial de navegación de Next.js | `app/loading.tsx` |
| Medición reproducible | `scripts/measure-navigation.mjs`, `evidencias/navigation-*.json` |
| Build de QA separado del servidor de desarrollo | `scripts/build-qa.mjs`, `next.config.mjs`, `playwright.p02.config.ts` |

Se mantiene la verificación `getUser()` contra Auth y la lectura del perfil activo en el servidor. No se almacena el rol entre solicitudes, no se utiliza una cabecera enviada por el navegador para autorizar y no se cachean pedidos para aparentar rapidez. Cada página protegida conserva su guarda; exportar sin rol admin devuelve 403 y no genera un archivo.

La búsqueda utiliza los 63 productos cargados; escribir no envía solicitudes de catálogo. No se agregaron índices ni filtros adicionales de estado/categoría. La categoría participa en el texto buscable. La edición se bloquea en otros productos mientras existe un borrador pendiente y no se descarta por ocultar temporalmente su fila.

## Velocidad: qué se midió y qué sigue pendiente

La medición inicial se hizo en el servidor de desarrollo de Omar, mediante Chrome y QA admin, desde el clic de la barra lateral hasta el encabezado de la pantalla. Hubo una ronda inicial y dos rondas con rutas ya compiladas. La primera entrada a Cocina tomó 7.834 ms; las rondas posteriores estuvieron alrededor de 1,1–1,3 s. Esto incluye el coste de desarrollo y la red real.

Una comprobación independiente de SDK mostró JWT ES256, `getClaims` caliente de 1–2 ms, `getUser` de 150–169 ms, lectura de perfil de 169–221 ms y consulta de cola de 179–198 ms. No se imprimieron tokens ni claves. Las consultas de red sucesivas explican parte de la espera. No se midió el despliegue real de Vercel ni un teléfono físico.

La reducción de duplicados y el indicador de carga están implementados, pero **las muestras de desarrollo posteriores no demostraron una reducción general reproducible de los tiempos calientes**. No se presenta una mejora porcentual que los datos no respaldan. Se conservaron las verificaciones de seguridad en vivo.

En la versión compilada de QA local se observaron medias calientes entre **881 y 949 ms** para las cuatro rutas. Esto es otro modo de ejecución; no es una comparación controlada que permita atribuir toda la diferencia al cambio de código. Los JSON conservan las muestras completas. El estado de carga evita dejar la interfaz sin respuesta visible mientras llegan los datos; no elimina la latencia de red.

El seguimiento de rendimiento general queda abierto en P14. Los advisors remotos también señalan [políticas con llamadas repetidas a Auth](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan), [políticas permisivas múltiples](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) y [claves foráneas sin índices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). No se modificó producción para resolverlos. Los avisos por sí solos no prueban que sean la causa dominante con este volumen de datos; falta medir después de aplicar las políticas P01 y confirmar la configuración de Vercel.

## Pruebas y límites

1. Buscar Cappuccino con espacios y mayúsculas; buscar Cañahua/Piña sin tildes y CAFES por categoría. Comprobar Latte, variantes adicionales e inactivo; vaciar resultados y limpiar. Se confirmó cero peticiones al catálogo al escribir.
2. Editar Cappuccino, cambiar la búsqueda a Focaccia, recuperar el producto y conservar el borrador. Interceptar PATCH y verificar UUID/importe exactos, respuesta de confirmación y precio mostrado.
3. Rechazar precio vacío; simular 403, conservar borrador y permitir cancelar. No informar éxito cuando la API falla.
4. Revisar 1365×900 y 390×844: búsqueda visible, documento sin desbordamiento horizontal; la tabla conserva scroll propio. Capturas privadas en `test-results/p02/`.
5. Repetir los ocho casos de acceso P01, incluyendo perfil inactivo, rutas administrativas y exportación denegada. Los dos fallos iniciales de selectores de prueba —cantidad de variantes Latte y alertas del anunciador Next— se corrigieron y sus casos se repitieron satisfactoriamente.

El PATCH de guardado y el error 403 están **simulados por Playwright**, y cualquier otra escritura de catálogo se aborta. No se cambió un producto del negocio para probarlo. La persistencia tras recargar y el rechazo de staff por la Data API real siguen pendientes de la validación del destino; los controles SQL correspondientes fueron probados con datos sintéticos en P01, pero no están aplicados al Supabase compartido. No presentar la simulación como una venta/edición real completada.

```powershell
pnpm build:qa
pnpm test:p02
pnpm test:p01
```

El build de QA usa `.next-qa` y no sustituye la carpeta `.next` del servidor de desarrollo activo. `build-qa.mjs` restaura la referencia generada de `next-env.d.ts` al terminar. Las pruebas usan Chrome instalado y el puerto local 3101.

## Guía de revisión manual

1. Con el servidor local activo, entrar como QA admin y abrir `/menu-admin`.
2. En **Buscar productos**, escribir `Cappuccino`: aparece el resultado y su cantidad.
3. Probar `canahua`, `pina`, `CAFES` y `latte`. En Latte se ven también las variantes y el producto inactivo.
4. Escribir un nombre inexistente; comprobar el mensaje. Pulsar **Limpiar búsqueda**: reaparecen los productos y el foco vuelve al buscador.
5. Buscar Cappuccino, pulsar **Editar precio** y escribir un borrador. Buscar Focaccia; debe mantenerse el aviso de edición pendiente. Pulsar **Mostrar producto en edición** y comprobar que el importe sigue allí. Terminar con **Cancelar edición**.
6. En móvil, confirmar que el buscador cabe y que solo la tabla se desplaza horizontalmente para alcanzar las acciones.
7. Cambiar entre Cocina, Café y Pedidos: aparece **Cargando…** cuando la respuesta tarda; la navegación permanece disponible. Verificar además con staff que no aparece Admin menú.

Para comparar la sensación de uso sin compilación en cada primera visita, detener `pnpm dev` antes de ejecutar `pnpm build` y luego `pnpm start`. Ambos usan normalmente el puerto 3000. No ejecutar build normal simultáneamente con dev, porque comparten `.next`. Los comandos QA anteriores están separados para evitar ese conflicto.

Hasta completar la validación de escritura, revisar manualmente edición/cancelación; pulsar Guardar desde la aplicación normal sí modificaría el producto real.
