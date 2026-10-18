# Faro — Dossier Técnico y Comercial

**Versión:** 1.0 · Octubre 2026
**Producto:** Faro — ventas, anuncios y ganancia de un ecommerce en un solo lugar
**URL de producción:** https://forever-dashboard.vercel.app · Demo pública: `/demo`
**Estado:** en producción, acceso anticipado gratuito

> **Cómo leer este documento.** Todo lo descrito como "listo" está funcionando en producción y probado con datos reales de una tienda en operación (Forever Basics). Lo que todavía no existe está marcado explícitamente como *roadmap* en la sección 6. Las cifras de rendimiento son las que el sistema tiene configuradas o se midieron en uso real; no hay todavía un SLA contractual (ver sección 5).

---

## Índice

1. [Resumen ejecutivo y valor de negocio](#1-resumen-ejecutivo-y-valor-de-negocio)
2. [Core features y caso de uso](#2-core-features-y-caso-de-uso)
3. [Especificaciones y arquitectura técnica](#3-especificaciones-y-arquitectura-técnica)
4. [Implementación, onboarding y requisitos](#4-implementación-onboarding-y-requisitos)
5. [Seguridad, privacidad y confiabilidad](#5-seguridad-privacidad-y-confiabilidad)
6. [Perfil del cliente ideal y estado del proyecto](#6-perfil-del-cliente-ideal-icp-y-estado-del-proyecto)
7. [Anexo: argumentos de venta y objeciones frecuentes](#7-anexo-argumentos-de-venta-y-objeciones-frecuentes)

---

## 1. Resumen ejecutivo y valor de negocio

### 1.1 Qué es Faro

Faro es un tablero de gestión para tiendas online que **cruza las ventas reales de Tiendanube con la inversión en Meta Ads y los costos del negocio**, para mostrar la ganancia verdadera, explicar qué la mueve y permitir actuar sobre las campañas desde el mismo lugar. Combina analítica financiera, gestión de pauta e inteligencia artificial en una sola herramienta pensada para el ecommerce latinoamericano.

### 1.2 El problema que resuelve

Un ecommerce chico o mediano que vende por Tiendanube y pauta en Meta tiene hoy los datos repartidos en tres lugares que no se hablan:

| Fuente | Qué sabe | Qué no sabe |
|---|---|---|
| **Tiendanube** | Cuánto se vendió | Qué anuncio trajo cada venta, cuánto costó conseguirla |
| **Meta Ads** | Cuánto se gastó y su "ROAS" | El costo de la mercadería, el envío, las comisiones, los impuestos: la ganancia real |
| **Planilla del dueño** | Los costos | Nada en tiempo real; se arma a mano, tarde y con errores |

La consecuencia es que **el dueño decide cuánto invertir mirando un ROAS que no es su ganancia**, se entera tarde cuando algo se rompe (un anuncio que dejó de entregar, un talle agotado, una tarjeta rechazada) y dedica horas por semana a juntar números. En Argentina se suma la inflación: comparar meses en pesos corrientes no dice nada.

### 1.3 Beneficios económicos para el ecommerce

| Beneficio | Cómo lo logra Faro | Impacto económico |
|---|---|---|
| **Dejar de perder plata en pauta** | Calcula el *costo máximo por compra* desde el margen real de cada venta y marca en verde o rojo cada campaña, ad set y anuncio contra ese número. Reglas automáticas proponen pausar lo que gasta sin vender. | Reduce la inversión improductiva. En la tienda piloto, el primer análisis identificó anuncios que gastaban sin ninguna compra atribuida. |
| **Escalar con seguridad** | Curva de saturación (hasta qué gasto diario se sostiene el costo por compra) y simulador de presupuesto basado en el historial propio. | Permite subir inversión en lo que rinde sin "romper" el costo de adquisición. |
| **Ganancia real, no estimada** | Estado de resultados mensual armado desde las órdenes, con costo de mercadería por producto y fecha, comisiones por medio de pago, envíos, IIBB, impuestos de la pauta y costos fijos. Chequeo automático que avisa qué costo falta. | Evita decisiones sobre márgenes inflados (caso real: un margen que mostraba 64% tenía envíos bonificados e impuestos sin cargar). |
| **Ahorro de tiempo** | Reemplaza la planilla semanal: los números se actualizan solos (webhooks + sincronización cada 30 min). Resumen semanal por mail y diario por WhatsApp. | Horas por semana del dueño o del equipo de marketing que hoy se van en armar reportes. |
| **Detectar problemas antes** | Diagnóstico automático semanal ("bajó la ganancia porque el ad set X dejó de entregar y se agotó el talle M"), alertas urgentes de la cuenta de Meta (pagos rechazados, límite de gasto, anuncios rechazados), fatiga de creativos. | Menos días perdidos con una campaña caída o un producto agotado que se sigue promocionando. |
| **Más recompra** | Segmentos de clientes listos (compró una vez y no volvió, compradores frecuentes, perdidos), cohortes de recompra y exportación a Meta como públicos o CSV para WhatsApp/mail. | Activa a clientes existentes, que cuestan menos que conseguir nuevos. |
| **Operar la pauta más rápido** | Carga de anuncios en lote: versión feed + historias en un mismo anuncio, en varios ad sets a la vez, con las mejoras automáticas de Meta configuradas según especialistas. Cambios de presupuesto y pausas con revisión previa y deshacer. | Minutos en vez de horas en el Administrador de anuncios; menos errores de configuración que empeoran la entrega. |
| **Decisiones que se miden** | Cada cambio aprobado vuelve a los 7 días con el resultado (antes vs. después). Promos y experimentos registrados con comparación automática. | Aprende qué funciona con datos propios, no con intuición. |

> **Nota para la propuesta comercial:** los impactos cuantitativos (porcentaje de ahorro, aumento de ganancia) deben validarse con métricas de los primeros clientes piloto antes de publicarse como promesa. Los mecanismos descritos arriba están todos funcionando.

---

## 2. Core features y caso de uso

### 2.1 Funcionalidades principales

Faro se organiza en cinco secciones más ajustes. Todas trabajan sobre los mismos datos y en la zona horaria del negocio.

#### Inicio — "cómo vengo y qué hago hoy"

| Funcionalidad | Qué hace | Impacto para el dueño |
|---|---|---|
| Indicadores clave | Facturación, ganancia después de publicidad, MER y costo por compra del período, con comparación contra el período anterior | Responde "¿cómo vengo?" en 10 segundos |
| Gráfico diario | Ventas, inversión y ganancia por día | Ve tendencias y días anómalos |
| **Qué pasó esta semana** (IA analítica) | Diagnóstico automático: compara la semana contra la anterior y explica la causa en ad sets, anuncios, productos, stock, medios de pago, embudo y recompra | Entiende el *por qué* sin investigar |
| **Cómo salieron tus decisiones** | Cada pausa o cambio de presupuesto aprobado vuelve a los 7 días con el resultado | Cierra el ciclo decidir → medir |
| **Preguntale a Faro** | Preguntas en lenguaje natural ("¿cuánto gané esta semana vs. la anterior?") respondidas con los datos del negocio, con gráfico cuando ayuda | Acceso a la información sin navegar pantallas |
| Plan sugerido por IA | Análisis completo de estructura de campañas, creativos, embudo y márgenes; propone qué escalar, corregir y publicar | Segunda opinión de un media buyer con los datos reales |
| Acciones sugeridas | Pausar, subir/bajar presupuesto, rotar creativos, reponer stock, con un clic para aplicar | Convierte el análisis en acción |
| Primeros pasos | Guía de configuración con avance para negocios nuevos | Onboarding sin soporte |

#### Ventas

| Funcionalidad | Impacto |
|---|---|
| Resumen: facturación, órdenes, ticket promedio, unidades por orden, margen; medios de pago con comisión, envíos (cuánto cuesta cada método), provincias, día de la semana | Entender de dónde viene la plata y dónde se va |
| **Mapa de calor día × hora** | Programar lanzamientos, historias y subas de presupuesto en las mejores franjas |
| Embudo: visitas → carrito → checkout → compra, con el paso más débil señalado | Saber si el problema es el anuncio o la tienda |
| Productos: margen bruto, días de stock, **margen después de publicidad** por producto | Saber qué producto conviene empujar |
| **Cobertura de stock por variante** (talle/color) con sugerencia de reposición a 30 días | Evitar quiebres en lo que más se vende; base para planificar producción |
| **Se compran juntos** (análisis de canasta) | Armar packs y promos con datos |
| Clientes: nuevos vs. recurrentes, valor de vida, **cohortes de recompra**, **valor a 90 días por canal de origen** | Medir retención y qué canal trae mejores clientes |
| **Segmentos listos** (VIP, una compra sin volver, perdidos, recientes) → CSV o **público personalizado en Meta** (emails cifrados) | Campañas de recompra y exclusiones en un clic |

#### Anuncios (Meta Ads)

| Funcionalidad | Impacto |
|---|---|
| Tabla campañas → ad sets → anuncios con columnas por vista (resultados, entrega, embudo, video), comparación contra el período anterior en cada fila | Toda la cuenta legible en una pantalla |
| Costo por compra coloreado contra el **máximo rentable** del negocio | Saber qué rinde según *tu* margen |
| Panel de detalle: evolución diaria, desglose por edad, género, provincia, plataforma y ubicación | Diagnóstico sin abrir el Administrador de anuncios |
| Edición con revisión: pausar/activar, presupuesto (con aviso si reinicia aprendizaje), nombre, segmentación, textos; **deshacer** | Cambios seguros y auditables |
| Campañas **protegidas** que nadie (ni reglas, ni IA) toca | Cuida lo que funciona |
| **Alertas de cuenta**: estado de la cuenta, límite de gasto, aprendizaje limitado, anuncios rechazados | Problemas detectados apenas aparecen |
| **Fatiga de creativos** (CTR, hook rate y costo por compra en 7 días vs. 7 anteriores) | Rotar antes de que caigan las ventas |
| Galería de creativos con veredicto (ganador, rentable, gastó sin vender), **etiquetas** por ángulo/formato/producto y reporte por etiqueta | Aprender qué idea creativa funciona |
| **Ventas reales de Tiendanube por anuncio** (atribución por UTM) y ROAS real | Atribución independiente de la que informa Meta |
| **Cargar anuncios**: imágenes/videos en lote, feed 4:5 + historias 9:16 en un solo anuncio, varios ad sets o ad set nuevo, varios textos y títulos, UTMs automáticas, todo en pausa | Publicación rápida y bien configurada |
| Mejoras automáticas de Meta (Advantage+ creative) configuradas según consenso de especialistas; multianunciante apagado por defecto | Mejor entrega sin tocar configuraciones ocultas |
| **Reglas con aprobación** (pausar lo que no vende, bajar caros, escalar ganadores, avisar frecuencia alta) | Automatización sin sorpresas: nada se aplica sin aprobación |
| **Plan de inversión mensual** con avance, proyección de cierre y presupuesto diario necesario | Controlar la inversión del mes |
| **Análisis**: curva de saturación (hasta dónde escalar) y simulador de presupuesto | Decidir cuánto invertir con el historial propio |
| Historial de cambios: los hechos en Faro y en el Administrador de anuncios por cualquier usuario o app | Auditoría completa de la cuenta |

#### Finanzas

| Funcionalidad | Impacto |
|---|---|
| Estado de resultados mensual desde las órdenes reales (facturación → mercadería → envíos → comisiones → packaging/IIBB → publicidad → fijos → resultado operativo) | Ganancia real, mes a mes |
| **Cascada visual** de la facturación al resultado y **tendencia de 12 meses** vs. mismo mes del año anterior | Ver dónde se va cada peso |
| **Pesos de hoy (ajustado por inflación INDEC) o dólar MEP** | Comparar meses en una economía inflacionaria |
| **Chequeo de costos**: avisa qué costo falta o está mal cargado | Confianza en el número |
| Proyección de cierre del mes en curso y ventas para cubrir fijos | Anticipar el resultado |
| **Objetivos del mes** por indicador, con avance contra el ritmo | Gestión por metas |
| **Promos y experimentos**: antes / durante / después calculado solo | Saber si una promo (3x2, envío gratis) realmente funcionó |
| Costos fijos con vigencia, costos del mes, cierre de mes (congela el resultado) | Contabilidad de gestión ordenada |
| **Caja proyectada**: cobros por acreditar por semana según los días de cada medio de pago, contra fijos semanales | Saber cuándo entra la plata |

#### Ajustes y operación

- Conexiones (Tiendanube, Meta), costos y comisiones por medio de pago (con días de acreditación), costo de productos con historial, punto de equilibrio, configuración de mejoras de Meta, equipo con roles (dueño, edita, solo lectura), estado de la sincronización.
- **Multi-negocio:** un usuario puede manejar varias marcas, cada una con su tienda, cuentas de Meta, costos y equipo.
- **Resumen semanal por mail** (automático los lunes, manual cuando se quiera, a uno mismo, al equipo o a terceros como socios o contador, con historial y reenvío).
- **Avisos por WhatsApp**: resumen de ayer cada mañana con el "por qué" y alertas urgentes de la cuenta (requiere activar WhatsApp Cloud API).
- Módulo opcional de **gestión de cambios y devoluciones** (portal de autogestión para el cliente final, etiquetas de envío, seguimiento).

### 2.2 Flujo de usuario típico

**Alta y configuración (una vez, ~15–30 minutos)**

```
1. Crear cuenta (email o Google)            → landing / registro
2. Conectar Tiendanube (OAuth, 1 clic)      → Faro trae historial de pedidos y productos
3. Conectar Meta Ads (Facebook Login)       → elige cuentas publicitarias; Faro trae campañas y resultados
4. Cargar comisiones e impuestos            → Ajustes → Costos y comisiones (valores sugeridos)
5. Cargar costo de productos                → o usar el costo cargado en Tiendanube
6. (Opcional) Celular para WhatsApp, equipo, costos fijos, plan mensual, reglas
```

**Uso diario (5 minutos)**

```
Mañana   → Llega el WhatsApp: "Ayer 12 ventas por $460.000, ganancia $172.000,
           costo por compra dentro del máximo. Por qué: …"
Abre Faro → Inicio: indicadores, "Qué pasó esta semana", acciones sugeridas
Decide   → Aprueba una pausa o una suba de presupuesto (revisión → publicar en Meta)
           o pregunta "¿qué anuncio conviene escalar?"
```

**Uso semanal (20–30 minutos)**

```
Lunes    → Llega el resumen semanal por mail
Anuncios → Revisa propuestas de reglas, fatiga, creativos ganadores; carga creativos nuevos
Ventas   → Segmentos de clientes → crea un público de recompra en Meta
Inicio   → "Cómo salieron tus decisiones": resultado de lo aprobado hace 7 días
```

**Cierre mensual**

```
Finanzas → Estado de resultados, chequeo de costos, comparación en pesos de hoy
         → Cierre de mes (congela números), objetivos del mes siguiente, plan de inversión
```

---

## 3. Especificaciones y arquitectura técnica

### 3.1 Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Lenguaje | **TypeScript 5.9** | Tipado en todo el código (frontend, backend, cálculos) |
| Framework web | **Next.js 14** (App Router) + **React 18** | Server Components para cálculo en servidor; Route Handlers como API |
| Estilos y UI | **Tailwind CSS 3.4**, sistema de diseño propio con tokens (modo claro/oscuro), gráficos SVG propios y **Recharts** | Responsive, barra de navegación inferior en celular, instalable (PWA) |
| Base de datos | **PostgreSQL (Supabase)**, región **sa-east-1 (São Paulo)** | Row Level Security en todas las tablas |
| Autenticación | **Supabase Auth** (email + contraseña, recuperación, Google OAuth opcional) | Cookies httpOnly vía `@supabase/ssr` |
| Hosting y cómputo | **Vercel** (serverless functions, CDN, deploys automáticos desde GitHub) | Funciones de 60 s; IA hasta 300 s |
| Tareas programadas | **Vercel Cron** + **GitHub Actions** (cada 30 min) | Sincronización, resumen semanal, avisos |
| IA | **Anthropic Claude** (API Messages, salida estructurada con JSON Schema) | Plan sugerido, Preguntale a Faro. El modelo es configurable por variable de entorno |
| Mail | **Resend** (API) o **SMTP** propio (nodemailer) | Remitente con dominio propio verificado |
| Mensajería | **WhatsApp Cloud API** (Meta), plantillas de utilidad | Construido; requiere alta del número |
| Datos macro | API pública **argentinadatos.com** (inflación INDEC, dólar MEP) | Caché de 12 h; si falla, la app sigue en pesos |
| PDFs | **pdf-lib** | Etiquetas de envío del módulo de cambios |
| Testing | **Vitest** (pruebas de cálculo, paginación, límites, cifrado, diagnóstico, etc.) | 45+ pruebas automáticas |

### 3.2 Arquitectura general

```
                        ┌──────────────────────────────────────────────┐
  Navegador / celular   │                 VERCEL                       │
  (dueño, equipo) ─────▶│  Next.js 14                                  │
                        │  ├─ Páginas (Server Components)  ── cálculo  │
                        │  ├─ API /api/v2/*  (Route Handlers)          │
                        │  ├─ Webhooks Tiendanube                      │
                        │  └─ Cron: sync · semanal · avisos            │
                        └───────┬──────────────┬──────────────┬────────┘
                                │              │              │
                     service role│        HTTPS│         HTTPS│
                                ▼              ▼              ▼
                ┌──────────────────┐  ┌───────────────┐  ┌──────────────────┐
                │ SUPABASE (SP)    │  │ APIs externas │  │ Servicios         │
                │ Postgres + RLS   │  │ Tiendanube    │  │ Anthropic (IA)    │
                │ Auth · Storage   │  │ Meta Graph    │  │ Resend / SMTP     │
                └──────────────────┘  │ v24.0         │  │ WhatsApp Cloud    │
                                      └───────────────┘  │ argentinadatos    │
                                                         └──────────────────┘
   GitHub Actions ── cada 30 min ──▶ /api/v2/cron/sync (con secreto)
```

**Principios de diseño:**

- **Datos crudos, cálculo propio.** Faro guarda las órdenes y las métricas de anuncios por anuncio y por día, y calcula todo período, margen y comparación en el servidor, en la zona horaria del negocio. No depende de reportes precalculados de las plataformas.
- **Multi-tenant por "negocio" (workspace).** Cada negocio agrupa tiendas, cuentas de Meta, costos, reglas y equipo. Un usuario puede pertenecer a varios negocios con distinto rol.
- **Lectura amplia, escritura con aprobación.** Faro lee todo; toda escritura en Meta (pausas, presupuestos, anuncios nuevos) pasa por una revisión del usuario, queda registrada y se puede deshacer.
- **Lógica de negocio pura y testeable.** Los cálculos (márgenes, diagnóstico, reglas, cohortes, saturación, inflación) son funciones puras con pruebas automáticas; la carga de datos está separada.

### 3.3 Flujo de datos

```
TIENDANUBE                                 META ADS
   │ webhook (orden nueva/actualizada)        │ Graph API v24.0
   │ + reconciliación por updated_at          │ entidades (campañas, ad sets, anuncios)
   │ + backfill histórico (400 días)          │ insights por anuncio y día (+ backfill)
   ▼                                          ▼
 orders, order_attribution (UTM)           ad_entities, ad_insights_daily
 productos/stock (caché 30 min)            alertas de cuenta (caché 15 min)
   │                                          │
   └──────────────┬───────────────────────────┘
                  ▼
     Cálculo en servidor (TypeScript)
     ventas netas, contribución por orden (costo de producto por fecha,
     comisión por medio de pago, envío, packaging, IIBB), publicidad + impuestos,
     ganancia, MER, costo por compra máximo, diagnósticos, reglas, cohortes…
                  │
     ┌────────────┼──────────────┬────────────────┬──────────────────┐
     ▼            ▼              ▼                ▼                  ▼
  Pantallas   Resumen mail   WhatsApp diario   IA (paquete        Escrituras en Meta
  de Faro     (lunes)        y urgentes        compacto → Claude)  (con aprobación,
                                                                   change_log + deshacer)
```

**Sincronización:**

| Disparador | Qué trae | Frecuencia |
|---|---|---|
| Webhook de Tiendanube | Orden nueva o modificada | Inmediato |
| Cron (GitHub Actions) | Tiendanube incremental + Meta (entidades e insights) | Cada 30 min |
| Cron diario (Vercel) | Respaldo del anterior | 1 vez por día |
| Al abrir la app / botón Actualizar | Lo nuevo, si el dato tiene más de 5 min | A demanda |
| Primer alta | Historial de Tiendanube (hasta ~400 días) y de Meta | Una vez, en tandas |

### 3.4 Integraciones y APIs

| Integración | Estado | Alcance |
|---|---|---|
| **Tiendanube** | ✅ Producción | OAuth de app, pedidos (con webhooks), productos, variantes, stock, costo de producto, URL de llegada (UTM) para atribución, checkouts para embudo |
| **Meta Marketing API (v24.0)** | ✅ Producción | Facebook Login para empresas; lectura de cuentas, campañas, ad sets, anuncios, insights con desgloses, registro de actividad; escritura de estado, presupuesto, nombre, segmentación, textos; creación de campañas, ad sets, creativos (incl. personalización por ubicación feed/historias), anuncios; duplicación; públicos personalizados (emails hasheados SHA-256). App en modo *Live* bajo portfolio verificado |
| **Anthropic (Claude)** | ✅ Producción | Plan de acción y "Preguntale a Faro" con salida JSON estructurada |
| **Mail (Resend / SMTP)** | ✅ Producción (requiere dominio verificado del cliente o de Faro) | Resumen semanal automático y manual |
| **WhatsApp Cloud API** | 🟡 Construido, pendiente de activación | Plantilla de utilidad; resumen diario y alertas urgentes |
| **Inflación y dólar (argentinadatos)** | ✅ Producción | IPC INDEC mensual y dólar MEP diario |
| **Google (login)** | 🟡 Construido, se activa por configuración | Ingreso con Google vía Supabase |
| Mercado Pago (comisiones/acreditaciones reales) | ⏳ Roadmap | Hoy: porcentajes y días configurados por el usuario |
| Mercado Libre | ⏳ Roadmap | Ventas, comisiones, envíos y Mercado Ads |
| Shopify / WooCommerce / VTEX | ⏳ Roadmap | Misma estructura de datos que Tiendanube |
| Google Ads / TikTok Ads | ⏳ Roadmap | Mismo patrón de conector que Meta |
| Logística (Andreani, OCA, Correo Argentino) | ⏳ Roadmap (parcial en módulo de cambios) | Costo real de envío por orden |
| CRMs | ⏳ No planificado a corto plazo | Hoy: exportación CSV de segmentos |

**API interna** (`/api/v2/*`): ~25 grupos de endpoints REST autenticados por sesión (ventas, anuncios, mutaciones, reglas, objetivos, segmentos, IA, envíos). Los endpoints de cron requieren un secreto compartido. No hay por ahora una API pública documentada para terceros.

### 3.5 Rendimiento, latencia y escalabilidad

**Tiempos observados y configurados:**

| Operación | Tiempo |
|---|---|
| Actualización de una venta nueva | Inmediata vía webhook; peor caso, siguiente sincronización (≤ 30 min) |
| Actualización de métricas de Meta | Cada 30 min (las propias métricas de Meta tienen demora de la plataforma) |
| Carga de pantallas | Cálculo en servidor sobre datos ya guardados; típicamente pocos segundos |
| "Preguntale a Faro" | 5–7 s por pregunta (medido) |
| Plan sugerido por IA | Hasta ~1 min |
| Publicar un anuncio (imagen) | Segundos; video: espera el procesamiento de Meta (reintento automático) |
| Límite por función | 60 s (sincronización trabaja en tandas de 35 s y continúa en la siguiente) |

**Robustez frente a límites de Meta:** paginación adaptativa (si Meta pide menos datos, reduce el tamaño de página y divide rangos), monitoreo del uso de la cuenta (frena al 60% del límite), pausa de 15 min ante límite de llamadas, sin bucles de reintento. Cachés de 15–30 min para desgloses, alertas y productos.

**Escalabilidad:**

- **Cómputo:** serverless en Vercel, escala horizontalmente por demanda; cada negocio se sincroniza en paralelo.
- **Base de datos:** Postgres gestionado; índices por cuenta y fecha en las tablas de alto volumen.
- **Dimensionamiento actual:** pensado y probado para tiendas de cientos a pocos miles de órdenes por mes. Parte de los cálculos se hacen en memoria en el servidor sobre el rango pedido (con tope de 50.000 filas por consulta).
- **Para tiendas grandes (decenas de miles de órdenes/mes):** el siguiente paso técnico es mover agregaciones a SQL/vistas materializadas y configurar las funciones en la región de São Paulo para bajar la latencia a la base. Está identificado, no implementado.

---

## 4. Implementación, onboarding y requisitos

### 4.1 Requisitos previos

| Requisito | Obligatorio | Detalle |
|---|---|---|
| Tienda en **Tiendanube** | Sí (para ventas y finanzas) | Cualquier plan; permiso de administrador para instalar la app |
| Cuenta publicitaria de **Meta** | Para la sección Anuncios | Acceso de administrador o anunciante a la cuenta y al portfolio comercial |
| Costos de productos | Recomendado | Cargados en Tiendanube o en Faro (con fecha de vigencia) |
| Comisiones por medio de pago e impuestos | Recomendado | Faro sugiere valores típicos editables |
| UTMs en los anuncios | Para ventas reales por anuncio | Faro las agrega solas en los anuncios que carga |
| Celular con WhatsApp | Opcional | Para avisos (una vez activado el servicio) |
| Navegador moderno | Sí | Escritorio o celular; instalable como app |

No requiere instalar nada en la tienda, tocar código, ni contratar infraestructura.

### 4.2 Complejidad y tiempos de setup

| Paso | Quién | Tiempo estimado |
|---|---|---|
| Crear cuenta | Dueño | 1 min |
| Conectar Tiendanube | Dueño | 1–2 min |
| Conectar Meta | Dueño | 2–5 min |
| Importación de historial | Automático | De minutos a ~1 h según volumen (la app es usable mientras tanto) |
| Comisiones, impuestos y packaging | Dueño | 5 min |
| Costo de productos | Dueño | 5 min (si usa el de Tiendanube) a 1 h (catálogo grande sin costos) |
| Equipo, costos fijos, objetivos, reglas | Dueño | 10–15 min, opcional |

**Complejidad: baja.** Un dueño de tienda lo configura solo en una sesión de 15–30 minutos; el resto se completa con el uso. Para clientes que prefieran acompañamiento, una videollamada de onboarding de 30–45 minutos cubre todo.

**Configuración del lado de Faro (una sola vez, no por cliente):** variables de entorno en Vercel (Supabase, Tiendanube, Meta, IA, mail, WhatsApp), app de Meta en modo *Live*, dominio de envío verificado.

---

## 5. Seguridad, privacidad y confiabilidad

### 5.1 Protección de datos

| Aspecto | Implementación |
|---|---|
| **Accesos a plataformas** | Tokens de Tiendanube y Meta **cifrados en reposo con AES-256-GCM**; la clave vive solo en el servidor (variable de entorno) |
| **Aislamiento entre negocios** | **Row Level Security** en todas las tablas: cada usuario solo puede leer datos de los negocios de los que es miembro; tablas sensibles (contactos de WhatsApp, atribución, registros de envío) sin acceso desde el cliente |
| **Roles** | Dueño, edita, solo lectura; los cambios en Meta y configuraciones requieren rol de edición |
| **Transporte** | HTTPS en todo; cabeceras de seguridad (HSTS, X-Frame-Options, etc.) |
| **Datos personales de clientes finales** | Se usan para métricas (recompra, segmentos). Al crear públicos en Meta, los emails se envían **hasheados (SHA-256)**, nunca en texto plano |
| **IA** | Se envía al modelo un **resumen agregado** del negocio (totales, campañas, productos); no se envían emails ni datos personales de clientes |
| **Pagos** | Faro **no procesa ni almacena** datos de tarjetas; solo lee el medio de pago de cada orden |
| **Escrituras** | Toda modificación en Meta queda registrada con usuario, fecha, valor anterior y nuevo; se puede deshacer |
| **Páginas legales** | Política de privacidad, términos y eliminación de datos publicadas (requisito de Meta) |
| **Endpoints internos** | Cron y salud protegidos por secreto; la ruta de salud pública no expone detalles |

### 5.2 Confiabilidad y tolerancia a fallos

- **Sincronización resiliente:** si Meta limita llamadas o una tanda no termina, se retoma en la siguiente ejecución desde donde quedó; los webhooks se reconcilian con una lectura incremental, por lo que una notificación perdida no deja huecos.
- **Degradación elegante:** si falla un servicio secundario (inflación, IA, mail, WhatsApp, desgloses de Meta), la pantalla principal sigue funcionando y se muestra un aviso puntual.
- **Sin efectos automáticos peligrosos:** reglas e IA solo **proponen**; las campañas protegidas no se tocan.
- **Respaldos:** los de la base gestionada por Supabase según el plan contratado.
- **Pruebas automáticas** sobre la lógica de cálculo antes de cada publicación.

### 5.3 Límites de consumo de APIs

| API | Límite y manejo |
|---|---|
| Meta Marketing API | Límites por cuenta publicitaria según el nivel de acceso de la app; Faro monitorea el uso y frena antes de saturar |
| Tiendanube | Límites por tienda; sincronización incremental y paginada |
| Anthropic | Por pregunta: ~7.000 tokens de entrada y < 500 de salida (centavos de dólar). Plan completo: más tokens, hasta 16.000 de salida |
| WhatsApp Cloud API | Conversaciones de utilidad iniciadas por el negocio: tarifa por conversación de Meta; 1 resumen diario + urgentes deduplicados por día |
| Resend | Plan gratuito: 3.000 mails/mes; ampliable |

### 5.4 Disponibilidad (uptime / SLA)

- **No hay hoy un SLA contractual propio.** La disponibilidad depende de la infraestructura gestionada sobre la que corre Faro (Vercel y Supabase) y de la disponibilidad de las APIs de Tiendanube y Meta.
- Recomendación para la etapa comercial: ofrecer en el acceso anticipado un compromiso de "mejor esfuerzo" y, al lanzar planes pagos, definir un SLA (por ejemplo, objetivo de disponibilidad mensual, ventanas de mantenimiento y tiempos de respuesta de soporte) respaldado por monitoreo externo de disponibilidad, que hoy no está implementado.

---

## 6. Perfil del cliente ideal (ICP) y estado del proyecto

### 6.1 Cliente ideal

| Dimensión | Perfil |
|---|---|
| **Plataforma** | Tiendanube (excluyente hoy) |
| **Canal de pauta** | Meta Ads (Facebook + Instagram) como canal principal |
| **Tamaño** | Facturación aproximada de **$5 M a $150 M ARS/mes**, entre ~100 y ~3.000 órdenes/mes, inversión en Meta de **$500.000 a $15 M ARS/mes** |
| **Equipo** | Dueño que maneja la pauta, o equipo de 1–5 personas; sin analista de datos dedicado |
| **Nicho** | Productos propios con margen y catálogo de variantes: **indumentaria** (caso piloto), calzado, accesorios, cosmética, deco, suplementos |
| **Geografía** | Argentina primero (inflación, IIBB, dólar MEP, cuotas); luego resto de Latinoamérica donde opera Tiendanube |
| **Dolor principal** | "No sé cuánto gano de verdad con lo que invierto en Meta" · "Armo planillas todas las semanas" · "Me entero tarde cuando algo se rompe" |

**Segundo perfil: agencias de performance** que manejan varias marcas en Tiendanube + Meta. Faro ya soporta múltiples negocios por usuario con roles; una vista consolidada de agencia está en roadmap.

**Menos indicado para:** marketplaces puros sin tienda propia (hasta integrar Mercado Libre), tiendas en Shopify/WooCommerce/VTEX (hasta integrar), negocios sin pauta paga, o grandes cuentas con stack de BI propio.

### 6.2 Estado actual del desarrollo

#### ✅ Listo para producción

| Área | Funcionalidades |
|---|---|
| Plataforma | Registro, login, recuperar contraseña, multi-negocio, roles de equipo, onboarding guiado, landing y demo pública, celular (PWA), modo claro/oscuro |
| Datos | Tiendanube (pedidos, productos, stock, webhooks, atribución UTM), Meta (lectura y escritura completas), sincronización resiliente |
| Inicio | Indicadores, diagnóstico semanal automático, seguimiento de decisiones, Preguntale a Faro, plan con IA, acciones sugeridas |
| Ventas | Resumen, mapa de calor, embudo, productos con margen después de publicidad, cobertura por variante, canasta, clientes, cohortes, segmentos a CSV y Meta |
| Anuncios | Tabla y panel, desgloses, alertas, fatiga, creativos con etiquetas y ventas reales, carga de anuncios feed + historias, mejoras de Meta, reglas con aprobación, plan mensual, saturación y simulador, historial con deshacer |
| Finanzas | Estado de resultados, cascada, tendencia 12 meses, inflación y dólar MEP, chequeo de costos, proyección, objetivos, promos y experimentos, costos fijos, cierre de mes, caja proyectada |
| Comunicación | Resumen semanal por mail (automático y manual, historial, reenvío) |
| Seguridad | Tokens cifrados, RLS, cabeceras, páginas legales, app de Meta en modo *Live* |

#### 🟡 Construido, requiere activación de configuración

- Avisos por WhatsApp (alta del número y plantilla en Meta).
- Ingreso con Google (proveedor en Supabase).
- Envío de mails desde dominio propio de Faro (hoy se puede usar un dominio verificado).

#### ⏳ Roadmap

| Prioridad | Ítem | Valor |
|---|---|---|
| Alta | **App pública en la tienda de aplicaciones de Tiendanube** | Canal de adquisición principal |
| Alta | **Costo real de envío por orden** (Andreani, OCA, Correo Argentino) | Exactitud del margen |
| Alta | **Mercado Pago** (comisiones y acreditaciones reales) | Exactitud de margen y caja |
| Alta | **Planes y cobro** (suscripción) | Monetización |
| Media | **Mercado Libre** (ventas + Mercado Ads) | Principal diferencial regional |
| Media | **Vista de agencia** (varios clientes, reportes con marca propia) | Canal de distribución B2B |
| Media | Google Ads y TikTok Ads | Ganancia sumando todos los canales |
| Media | Comparativas anónimas por rubro | Valor que crece con la base de clientes |
| Media | Informe mensual en PDF, exportar tablas a Excel | Reporte a socios/contador |
| Media | SLA formal con monitoreo externo; funciones en región São Paulo; agregaciones en SQL | Confiabilidad y escala |
| Baja | Shopify, WooCommerce, VTEX | Expansión de mercado |
| Baja | Notificaciones push, búsqueda global | Experiencia de uso |

---

## 7. Anexo: argumentos de venta y objeciones frecuentes

### Mensaje central

> **"Sabé cuánto ganás de verdad con cada peso en Meta."**
> Faro cruza tus ventas de Tiendanube con Meta Ads y tus costos. Te muestra la ganancia real, te explica qué la mueve y te deja actuar desde el mismo lugar.

### Diferenciales

1. **Ganancia real, no ROAS:** con costos, comisiones, envíos e impuestos de la pauta argentinos.
2. **Explica, no solo muestra:** diagnóstico automático del por qué, seguimiento de cada decisión.
3. **Actúa sobre Meta con seguridad:** cargar, pausar, escalar con revisión, protegidos y deshacer.
4. **Hecho para Argentina/Latam:** inflación, dólar MEP, IIBB, cuotas, WhatsApp.
5. **Nació en una tienda real** (Forever Basics) y se usa todos los días.

### Objeciones y respuestas

| Objeción | Respuesta |
|---|---|
| "¿Faro va a tocar mis campañas solo?" | No. Reglas e IA solo proponen; nada se publica sin aprobación y podés proteger campañas para que nadie las toque. Todo queda registrado con deshacer. |
| "¿Mis datos están seguros?" | Accesos cifrados (AES-256), cada negocio aislado a nivel base de datos, emails hasheados al crear públicos, y podés desconectar todo en cualquier momento. |
| "Ya uso el Administrador de anuncios y Tiendanube" | Faro no los reemplaza: los cruza. El Administrador no sabe tu margen; Tiendanube no sabe qué anuncio vendió. |
| "No tengo tiempo de configurar" | 15–30 minutos, sin código. Faro sugiere valores y te guía paso a paso. |
| "¿Funciona con Shopify / Mercado Libre / Google Ads?" | Hoy Tiendanube + Meta. Mercado Libre, Google y TikTok están en el roadmap. |
| "¿Cuánto cuesta?" | Gratis durante el acceso anticipado. Los planes pagos se anunciarán con anticipación. |

---

*Documento generado a partir del código y la configuración en producción de Faro (commit `4f6db1d`, octubre 2026). Actualizar ante cada versión mayor.*
