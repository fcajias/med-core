# MANUAL INTEGRAL DE USUARIO Y DOCUMENTACIÓN DEL SISTEMA
## Dispensario Médico FYDI — Control Clínico, Kardex y Bodega en Tiempo Real

---

## 📋 1. INTRODUCCIÓN Y ANTECEDENTES

### 1.1. Diagnóstico del Problema Previo
Anteriormente, el dispensario médico llevaba el control mediante dos archivos de Microsoft Excel independientes:
1. `MEDICINAS FYDI.xlsx`: Matriz de inventario mensual.
2. `PARTE DIARIO PCTES FIDY.xlsx`: Registro de pacientes atendidos y recetas diarias.

Durante la auditoría técnica profunda realizada al iniciar este proyecto, se detectaron fallas estructurales graves:
- **Fórmulas erróneas en inventarios mensuales:** En el balance de Julio 2026, la fórmula restaba el consumo mensual de la columna del pedido mínimo en lugar del stock inicial real (`=E3-AA3` en vez de `=D3-AA3`), arrojando saldos teóricos negativos o falsos.
- **Entregas no registradas como compras:** En Agosto y Septiembre de 2026 ingresaron medicamentos a bodega que no constaban en Kardex, lo cual generaba inconsistencias aparentes.
- **Falsos faltantes en Septiembre 2026:** El Excel original marcaba medicamentos como "faltantes" cuando en realidad correspondían a unidades legítimamente entregadas a los trabajadores en el parte diario.

### 1.2. Solución Profesional Desarrollada
Se construyó **Med-Core FYDI**, un sistema web local autónomo, respaldado por una base de datos relacional SQLite (`dispensario_fydi.db`), que reconcilió el 100% de los datos históricos:
- **57 productos** normalizados en catálogo con códigos únicos, presentaciones y concentraciones.
- **177 empleados/pacientes** dados de alta con cédula, nombres, edad, celular y área/piso de trabajo.
- **316 atenciones médicas** migradas y cuadradas al centavo.
- **Cero faltantes y cero sobrantes:** El stock actual del sistema coincide exactamente con el conteo físico real de bodega a Septiembre 2026.

---

## ⚙️ 2. ARQUITECTURA TÉCNICA DEL SISTEMA

El sistema opera bajo una arquitectura liviana, de cero dependencias externas pesadas y máxima portabilidad en sistemas Windows:

```
c:\Users\DavidDevOps\Desktop\medicina\
│
├── dispensario_fydi.db            # Base de datos SQLite relacional (57 meds, 177 pacientes, Kardex)
├── server.py                      # Servidor web nativo Python (API REST + Controlador HTTP)
├── excel_generator.py             # Motor dinámico en memoria de exportación Excel (.xlsx)
├── INICIAR_SISTEMA.bat            # Lanzador automático en 1 clic para Windows
├── MANUAL_DE_USUARIO_Y_SISTEMA.md # Este manual de usuario y sistema
├── README.md                      # Documentación general del repositorio
│
└── public/                        # Aplicación Web Frontend (SPA)
    ├── index.html                 # Estructura de pestañas, tablas y modales
    ├── app.js                     # Lógica reactiva, control de roles y validaciones
    └── styles.css                 # Estilos personalizados y utilidades de interfaz
```

### 2.1. Base de Datos Relacional (`dispensario_fydi.db`)
Estructura de tablas principales:
- `medicamentos`: Catálogo maestro de fármacos e insumos con saldo de stock en vivo.
- `pacientes`: Ficha demográfica y laboral del personal de la empresa.
- `atenciones`: Registro de consultas médicas con campos de estado (`ACTIVA` / `ANULADA`), auditoría de usuario (`usuario_registro`) y motivo de anulación (`motivo_anulacion`, `anulado_por`, `anulado_en`).
- `despachos`: Detalle de fármacos prescritos por consulta.
- `kardex`: Bitácora contable e inmutable de entradas, salidas, ajustes y reversiones con usuario ejecutor.
- `permisos_roles`: Matriz de autorización por perfil (Administrador, Enfermería, Auditor).
- `usuarios`: Cuentas de acceso con roles asignados.

---

## 🛡️ 3. SEGURIDAD, ROLES Y CONTROL DE PERMISOS (RBAC)

El sistema implementa Control de Acceso Basado en Roles para garantizar que ningún usuario realice acciones fuera de su competencia médica o administrativa.

### 3.1. Cuentas y Credenciales de Acceso

| Rol | Usuario | Contraseña | Enfoque de Trabajo |
| :--- | :--- | :--- | :--- |
| **Administrador / Supervisor** | `admin` | `admin123` | Control total: ajuste físico de stock, edición de catálogo, anulación de consultas, gestión de permisos. |
| **Enfermería** | `enfermeria` | `enfermera123` | Atención diaria de trabajadores, recetas médicas con doble confirmación. Bloqueada para alterar catálogo o saldos de bodega. |
| **Auditoría / Consulta** | `auditor` | `auditor123` | Solo lectura: supervisión de Kardex, bitácora de atenciones y descarga de balances en vivo. |

### 3.2. Matriz Dinámica de Permisos (Pestaña Exclusiva de Administrador)
El Administrador cuenta con la pestaña **"Permisos de Roles"** donde puede configurar con casillas de verificación (checkboxes) qué acciones puede ejecutar cada rol:

1. **Registrar Atenciones Clínicas y Despacho:** Permite atender pacientes y rebajar automáticamente el stock de bodega.
2. **Anular Atenciones y Reversar Stock:** Permite cancelar consultas erróneas reintegrando las medicinas a la bodega.
3. **Ingresar Compras / Donaciones a Bodega:** Permite asentar entradas de mercadería en Kardex y subir el stock.
4. **Ajuste Físico de Stock (Auditoría):** Permite sincronizar saldos cuando se realiza un conteo físico en perchas.
5. **Crear y Editar Medicamentos en Catálogo:** Permite modificar nombres genéricos, marcas comerciales, presentaciones o agregar nuevos fármacos.
6. **Administrar Matriz de Permisos de Roles:** Configuración exclusiva de permisos (protegida para evitar auto-bloqueo).
7. **Descargar Reportes en Excel Maestro:** Permite descargar el libro `.xlsx` en vivo.

---

## 🩺 4. GUÍA PASO A PASO: REGISTRO DE ATENCIÓN Y RECETA

Para registrar una atención médica y despachar medicamentos:

1. **Ingresar al Sistema:** Asegúrate de estar en sesión con el rol de **Enfermería** o **Administrador**.
2. **Ubicar la Pestaña "Nueva Atención (Despacho)":**
   - **Fecha:** Se carga automáticamente con la fecha de hoy.
   - **Búsqueda predictiva de Paciente:** Escribe la cédula o parte de los nombres/apellidos en el campo del paciente. Si ya fue atendido previamente, aparecerá una lista desplegable para autocompletar todos sus datos (edad, celular, área/piso). Si es un trabajador nuevo, escribe sus datos y quedará registrado automáticamente.
   - **Diagnóstico:** Escribe el motivo de la consulta (ej. *Cefalea intensa*, *Dolor lumbar*, *Gripe*).
3. **Seleccionar Medicamentos a Despachar:**
   - Selecciona el medicamento del selector desplegable. El sistema muestra el stock disponible en tiempo real y sus marcas comerciales conocidas (ej. *Paracetamol 500mg | Analgan*).
   - Digita la cantidad a recetar. **El sistema valida automáticamente que no se puedan recetar más unidades de las existentes en bodega.**
   - Puedes hacer clic en **"+ Agregar Otra Medicina"** para despachar múltiples medicamentos en la misma consulta.
4. **Doble Verificación Previa (Double-Check):**
   - Al hacer clic en **"Guardar Atención y Descontar Stock"**, el sistema **NO** descuenta de inmediato.
   - En su lugar, se despliega una **Ventana Emergente de Confirmación** mostrando:
     - Nombre completo del paciente y ubicación.
     - Diagnóstico registrado.
     - Lista exacta de medicamentos a entregar y cuánto stock quedará en bodega tras el despacho.
   - Si detectas un error tipográfico o te equivocaste de paciente, haz clic en **"Cancelar / Seguir Editando"**.
   - Si todo es correcto, haz clic en **"Confirmar y Despachar"**.
   - El sistema guarda la consulta, descuenta el stock de bodega en tiempo real y asienta la salida en el Kardex con el usuario que la registró.

---

## ↩️ 5. GUÍA PASO A PASO: ANULACIÓN DE ATENCIÓN Y REVERSIÓN DE STOCK

Si una enfermera registra una consulta por error (por ejemplo, una prueba de sistema, error de paciente o si el paciente no retiró la medicina):

### 5.1. Procedimiento de Anulación:
1. Inicia sesión con el rol de **Administrador**.
2. Dirígete a la pestaña **"Historial de Atenciones"** (o abre el **"Expediente del Paciente"**).
3. Localiza la fila de la consulta que deseas anular.
4. En la columna de **Acciones**, haz clic en el botón rojo **"Anular"**.
5. Se abrirá el modal **"Anular Consulta y Devolver Stock"** indicando:
   - Número de consulta y nombre del paciente.
   - Listado de medicamentos que serán reintegrados a la bodega.
6. **Ingresar Motivo de Anulación Obligatorio:** Escribe detalladamente la razón (ej. *"Registro accidental de prueba por capacitación"* o *"Paciente no retiró la medicina"*).
7. Haz clic en **"Confirmar Anulación y Devolver"**.

### 5.2. Efectos Inmediatos en el Sistema:
- **Restitución Automática de Bodega:** Las unidades despachadas vuelven al stock actual de bodega inmediatamente.
- **Asiento en Kardex:** Se genera un movimiento inmutable de tipo `REVERSION_ANULACION` indicando la consulta reversada, las unidades sumadas, el saldo anterior/nuevo y el usuario que autorizó la reversión.
- **Preservación del Historial Clínico:** La consulta se marca con el distintivo rojo `ANULADA` y texto tachado, conservando la trazabilidad del evento sin borrar información ni corromper las secuencias numéricas.
- **Exclusión de Estadísticas:** Las consultas anuladas quedan automáticamente excluidas de los cálculos de consumo mensual y del top de medicinas más consumidas.

---

## 📦 6. CONTROL DE BODEGA, ENTRADAS Y AJUSTE FÍSICO

### 6.1. Registro de Nuevas Entradas / Reposiciones
Cuando llegue mercadería nueva (compras, pedidos o donaciones):
1. Ve a la pestaña **"Inventario & Bodega"**.
2. Haz clic en el botón **"+ Registrar Entrada a Bodega"**.
3. Selecciona el producto, ingresa la cantidad recibida, proveedor, número de factura y lote/vencimiento.
4. Al guardar, el stock del medicamento se incrementa y se asienta el registro `ENTRADA` en el Kardex.

### 6.2. Consulta del Kardex Individual
- En la tabla de inventario, haz clic en el botón **"Kardex"** de cualquier medicamento.
- Se abrirá una ventana con el historial cronológico completo de ese fármaco:
  - Fecha exacta y hora.
  - Tipo de movimiento (`ENTRADA`, `SALIDA_RECETA`, `AJUSTE_AUDITORIA`, `REVERSION_ANULACION`).
  - Concepto (proveedor, número de consulta, motivo de ajuste).
  - Cantidad (+ / -).
  - Saldo anterior y saldo resultante.
  - Nombre y rol del usuario que ejecutó la transacción.

### 6.3. Ajuste Físico de Stock (Exclusivo Administrador)
Si durante una toma física de bodega trimestral o mensual se detecta una diferencia física por merma, rotura o vencimiento:
1. En la tabla de inventario, haz clic en el botón **"Ajustar"** (visible solo para Administrador).
2. Ingresa el **Nuevo Stock Físico Real**.
3. Ingresa la **Justificación Obligatoria** (ej. *"Toma física percha Septiembre 2026 - regularización de lote vencido"*).
4. El sistema actualiza el saldo y deja el comprobante de auditoría en el Kardex como `AJUSTE_AUDITORIA`.

---

## 📊 7. EXPEDIENTE DE PACIENTES Y ESTADÍSTICAS

### 7.1. Expediente Clínico de Trabajadores
En la pestaña **"Expediente de Pacientes"**:
- Buscador rápido por cédula, nombres o piso de trabajo.
- Indicador de cuántas visitas médicas tiene acumuladas cada colaborador.
- Al hacer clic en **"Ver Historial"**, se muestra su expediente completo con cada una de las fechas en que acudió al dispensario, diagnóstico de cada visita y medicinas suministradas.

### 7.2. Estadísticas de Consumo y Alertas
En la pestaña **"Estadísticas de Consumo"**:
- **Tarjetas Métricas:** Total de atenciones activas, total de trabajadores atendidos, unidades totales en bodega y productos en alerta de stock bajo/agotado.
- **Top 10 Medicinas Más Consumidas:** Permite planificar las compras prioritarias de reposición.
- **Top 10 Medicinas Menos Consumidas (Estancadas):** Permite prevenir el vencimiento de fármacos sin rotación.
- **Diagnósticos Más Frecuentes:** Epidemiología laboral (ej. cefaleas, lumbalgias, gastritis).
- **Evolución Mensual:** Comparativa del volumen de consultas entre meses.

---

## 📑 8. GENERACIÓN Y DESCARGA DINÁMICA DE EXCEL MAESTRO

El sistema cuenta con un botón verde permanente en la cabecera superior: **"Descargar Excel en Vivo"** (ruta `/descargar-excel`).

A diferencia de un archivo estático, este Excel se **genera en memoria al segundo exacto en que se presiona el botón**, reflejando la realidad viva de la base de datos con 4 hojas profesionales:

1. **`INVENTARIO_ACTUAL`:** Lista completa de medicamentos con su código, categoría, presentación, concentración, marcas comerciales, stock actual, stock mínimo y estado de semaforización (🟢 DISPONIBLE, 🟡 STOCK BAJO, 🔴 AGOTADO).
2. **`PARTE_DIARIO`:** Bitácora histórica de todas las atenciones médicas. Las consultas activas se muestran en texto normal y las anuladas aparecen claramente identificadas con estilo tachado y el motivo de anulación asentado.
3. **`KARDEX_MOVIMIENTOS`:** Registro contable de cada una de las transacciones (entradas, salidas, ajustes y reversiones), mostrando qué usuario realizó cada movimiento.
4. **`ESTADISTICAS_CONSUMO`:** Cuadro consolidado de fármacos con su total despachado y rotación acumulada.

---

## 🚀 9. PUESTA EN MARCHA Y MANTENIMIENTO DEL SISTEMA

### 9.1. Inicio Diario en 1 Clic
Para encender el dispensario en cualquier computadora con Windows:
1. Abre la carpeta del proyecto `c:\Users\DavidDevOps\Desktop\medicina`.
2. Haz doble clic sobre el archivo **`INICIAR_SISTEMA.bat`**.
3. Se abrirá la consola del servidor y tu navegador predeterminado cargará automáticamente en `http://localhost:5000`.

### 9.2. Copias de Seguridad (Backup)
Toda la información del sistema está contenida en un único archivo: **`dispensario_fydi.db`**.
- Para realizar un respaldo de seguridad, basta con copiar el archivo `dispensario_fydi.db` a una unidad externa, nube o memoria USB al final de la jornada.

### 9.3. Sincronización con el Repositorio GitHub
Los cambios, mejoras de código y manuales se mantienen sincronizados con el repositorio oficial:
`https://github.com/fcajias/med-core.git`

---

*Manual elaborado para el Dispensario Médico FYDI — Septiembre 2026.*
