# Menú lateral vacío: diagnóstico y corrección

Fecha: 03/11/2026. Base revisada: `7458871`, incluida en producción por el merge `6c70dc1`. Rama de corrección: `desarrollo/mejoras-octubre-2026`.

| Hallazgo | Resultado |
| --- | --- |
| Foto recibida | Pedidos cargado, barra lateral sin opciones y logo genérico. El texto Staff User identifica al comprador del pedido, no acredita el rol de la sesión. |
| Causa reproducida | Si falla la primera petición `/api/auth/access`, el estado inicial del rol queda nulo y se filtran todas las opciones del menú. |
| Conexión de la dueña | No se inspeccionó su red ni sus logs; una interrupción de red o del servicio puede disparar este fallo, pero la foto no permite atribuirlo a su conexión. |
| Corrección | Rol inicial validado por el servidor, navegación completa tras login y estados de carga/reintento. |

## Cambios

- `app/layout.tsx` obtiene el acceso activo del servidor y entrega solo el rol validado a AppShell. Se reutiliza la lectura React cacheada de esa petición que usan las páginas protegidas. No se guarda el rol en localStorage ni se toma de metadata editable.
- `app/login/page.tsx` inicia un documento autenticado nuevo después de validar usuario/perfil, conservando el destino permitido. Así no se arrastra el layout anónimo del login.
- `lib/use-access-guard.ts` conserva el rol verificado ante un fallo transitorio; comunica carga/no disponibilidad y permite reintentar. Mantiene el cierre al confirmar una denegación, el Broadcast y la comprobación al recuperar la app/conexión.
- `components/app-shell.tsx` usa el rol inicial; si no existe aún, muestra Cargando menú y, al fallar, No se pudo cargar el menú / Reintentar. No queda una barra silenciosa vacía.
- Los roles siguen limitando las opciones y las operaciones se autorizan en servidor/RLS como antes. La semilla del menú no concede permisos nuevos.

No se modificaron contraseñas, cuentas, pedidos, pagos, SQL ni configuración de Supabase. La incidencia de contraseña fue retirada por Omar después de comprobar que el cambio sí funcionó.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Reproducción previa | Una prueba en la compilación anterior produjo la barra vacía con HTTP 503 simulado, conservando Pedidos visible. |
| Navegación y regresión de acceso/administración | 16/16 aprobadas; incluyen login, recarga con 503, rol Cocina, dos pestañas, suspensión y desactivación. |
| Compilación de entrega | 1/1 aprobada: login, administración, Excel real y rutas QA bloqueadas. |
| Lógica | 51/51 aprobadas con ejecución serial. Una ejecución paralela junto al build había agotado una espera fija de milisegundos de una prueba P13 preexistente; no se cambió su implementación. |
| Preparación | 7/7 aprobadas. |
| Compilación y tipos | QA y entrega aprobadas; tipos sin errores. |
| Revisión visual | Escritorio 1365×900 y móvil 390×900. Menú visible, sin desbordamiento horizontal ni errores de hidratación. |
| Secretos | Cero coincidencias en fuente/recursos públicos. |

Evidencias locales ignoradas por Git: `test-results/navigation-before.*`, `navigation-final-ui.*`, `navigation-release-ui.*`, `navigation-unit-final.log`, `navigation-environment.log`, `navigation-artifacts.log` y capturas `navigation-recovery/before-1365.png`, `after-1365.png`, `after-390.png`.

## Revisión funcional

1. Abrir la vista previa actualizada y volver a entrar si estaba abierta la versión anterior.
2. En escritorio, comprobar la barra izquierda desde Pedidos. En móvil, abrir el menú con el botón superior.
3. Administración debe ver Empleados, Historial y Admin menú; Cocina conserva únicamente sus vistas autorizadas.
4. Para producción, integrar la corrección y esperar el despliegue correspondiente. Publicar la rama de prueba no actualiza por sí solo el dominio de producción.
