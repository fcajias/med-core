# Med-Core: Sistema de Control Clínico, Kardex y Bodega FYDI

Sistema integral para la gestión médica y control de inventario farmacéutico desarrollado para el dispensario médico ocupacional FYDI.

## 🚀 Características Principales

- **Gestión Clínica & Despacho Automático:** Registro de atenciones médicas con recetas múltiples. El stock se descuenta en tiempo real de bodega mediante transacciones atómicas.
- **Traductor de Marcas Comerciales a Genéricos:** Búsqueda predictiva (Analgan, Acitip, Digesflat, Finalin, Sal Andrews, etc.).
- **Control de Bodega & Kardex en Tiempo Real:** 57 ítems de catálogo cuadrados al 100% con la toma física de bodega. Trazabilidad completa de entradas, salidas y ajustes.
- **Control de Acceso por Roles (RBAC):**
  - 🛡️ **Administrador:** Control total, edición de catálogo, ajuste físico justificado de stock y registro de entradas.
  - 🩺 **Enfermería:** Registro de atenciones y recetas (descuento automático). Bloqueado para alterar inventario o catálogo.
  - 👁️ **Auditoría / Consulta:** Visualización y descarga de balances sin permisos de modificación.
- **Generación Dinámica de Excel:** Descarga en vivo del balance maestro (`.xlsx`) consultando la base de datos al segundo exacto de la petición.
- **Directorio y Expediente Clínico de Pacientes:** Historial de consultas, patologías previas y medicamentos recibidos por empleado.
- **Estadísticas Automáticas:** Top 10 más consumidos, top 10 menos consumidos (medicinas estancadas), patologías frecuentes y evolución mensual.

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

| Rol | Usuario | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin` | `admin123` |
| **Enfermería** | `enfermeria` | `enfermera123` |
| **Auditoría** | `auditor` | `auditor123` |

---
Desarrollado para Dispensario Médico FYDI.
