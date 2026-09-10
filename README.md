# Med-Core: Sistema de Control Clínico, Kardex y Bodega FYDI

Sistema integral para la gestión médica y control de inventario farmacéutico desarrollado para el dispensario médico ocupacional FYDI.

## 📖 Manual de Usuario y Sistema
Para una explicación paso a paso de cada módulo, consulte el documento completo:
👉 **[MANUAL DE USUARIO Y SISTEMA (MANUAL_DE_USUARIO_Y_SISTEMA.md)](MANUAL_DE_USUARIO_Y_SISTEMA.md)**

---

## 🚀 Características Principales

- **Gestión Clínica & Despacho Asistido:** Registro de atenciones médicas con recetas múltiples y autocompletado inteligente de pacientes por cédula o nombre.
- **Doble Verificación Previa (Double-Check):** Modal de confirmación antes de guardar para verificar paciente, diagnóstico y medicinas a descontar, evitando errores involuntarios.
- **Anulación y Reversión Automática de Stock:** Si se registra una atención por error o de prueba, el Administrador puede anularla con motivo obligatorio; el sistema reintegra automáticamente las unidades a la bodega y asienta el movimiento `REVERSION_ANULACION` en el Kardex.
- **Trazabilidad Total de Usuario (`usuario_registro`):** Cada consulta, entrada a bodega, ajuste físico o anulación queda registrada con el usuario y rol exacto que la ejecutó.
- **Control de Acceso por Roles (RBAC) & Matriz de Permisos:**
  - 🛡️ **Administrador / Supervisor:** Control total, edición de catálogo, ajuste físico justificado, anulación de consultas y configuración dinámica de la matriz de permisos.
  - 🩺 **Enfermería:** Registro de atenciones y recetas con doble confirmación. Bloqueado para alterar inventario o catálogo.
  - 👁️ **Auditoría / Consulta:** Visualización y descarga de balances sin permisos de modificación.
- **Generador de Excel en Tiempo Real:** Descarga en vivo del balance maestro (`.xlsx`) consultando la base de datos al segundo exacto de la petición, con 4 hojas profesionales (`INVENTARIO_ACTUAL`, `PARTE_DIARIO`, `KARDEX_MOVIMIENTOS`, `ESTADISTICAS_CONSUMO`).
- **Control de Bodega Cuadrado al 100%:** 57 ítems de catálogo sincronizados con el conteo físico real de Septiembre 2026.
- **Directorio y Expediente Clínico de Pacientes:** Historial de consultas, patologías previas y medicamentos recibidos por empleado.
- **Estadísticas de Consumo:** Top 10 más consumidos, top 10 estancados, patologías frecuentes y evolución mensual.

## 💻 Tecnologías Utilizadas

- **Backend:** Python 3 (servidor nativo con `http.server` y `sqlite3`, sin dependencias externas pesadas).
- **Generador de Excel:** `openpyxl` (generación dinámica en memoria).
- **Base de Datos:** SQLite (`dispensario_fydi.db`).
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, Vanilla JavaScript reactivo.

## 📦 Puesta en Marcha Rápida (Windows)

1. Clona este repositorio o descarga los archivos.
2. Haz doble clic en el archivo **`INICIAR_SISTEMA.bat`**.
3. Se iniciará el servidor local y se abrirá automáticamente tu navegador en `http://localhost:5000`.

### 🔑 Credenciales Predeterminadas

| Rol | Usuario | Contraseña | Capacidades Principales |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin` | `admin123` | Control total, ajuste de stock, anulación, permisos |
| **Enfermería** | `enfermeria` | `enfermera123` | Atención diaria y recetas con doble confirmación |
| **Auditoría** | `auditor` | `auditor123` | Solo lectura y descarga de reportes en vivo |

---
Desarrollado para Dispensario Médico FYDI — Septiembre 2026.
