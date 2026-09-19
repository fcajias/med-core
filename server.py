import http.server
import socketserver
import sqlite3
import json
import os
import urllib.parse
import hashlib
from datetime import datetime
from excel_generator import generar_excel_en_memoria

PORT = int(os.environ.get("PORT", 5000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "dispensario_fydi.db"))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")

TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL", "https://dispensario-fydi-fcajias.aws-us-east-2.turso.io")
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODk2NzY0MTcsImlkIjoiMDFhMGIwZmYtNjQwMS03ZWUwLWFkOGMtNWUzMDk2YjY5Y2NlIiwia2lkIjoic21ZNGFhYkhnbEVJSFVDZlVsQ08tUzRFbWdtYUlQZEF0Wk41QXdVblJpayIsInJpZCI6IjI5M2UwMTFlLThmMTUtNDkwZi1iNDIyLTJhMDg5YTQzMjcxMSJ9.saCriN_FRQci10TEQ3aB9mBdnip-2jHsNfPzjV5ZuVm4ShfcasgwRM5M0O_E0mWiUyWqEnKBSlBbIUeF4e8iCg")

try:
    import libsql_client
    HAS_LIBSQL = True
except ImportError:
    HAS_LIBSQL = False

class TursoRow:
    """Wrapper para compatibilidad 100% con sqlite3.Row"""
    def __init__(self, columns, values):
        self._columns = tuple(columns)
        self._values = tuple(values)
        self._dict = dict(zip(columns, values))

    def __getitem__(self, item):
        if isinstance(item, int):
            return self._values[item]
        return self._dict[item]

    def __iter__(self):
        return iter(self._values)

    def keys(self):
        return self._columns

    def items(self):
        return self._dict.items()

    def values(self):
        return self._values

    def get(self, key, default=None):
        return self._dict.get(key, default)

    def __repr__(self):
        return f"<TursoRow {self._dict}>"

class TursoCursor:
    """Cursor compatible con la API de sqlite3 para Turso Cloud"""
    def __init__(self, client):
        self.client = client
        self._iter = None
        self.lastrowid = None
        self.rowcount = 0

    def execute(self, sql, params=()):
        args = list(params) if params else []
        res = self.client.execute(sql, args)
        self.lastrowid = res.last_insert_rowid
        self.rowcount = res.rows_affected
        cols = res.columns
        rows = [TursoRow(cols, r) for r in res.rows]
        self._iter = iter(rows)
        return self

    def fetchone(self):
        return next(self._iter, None) if self._iter is not None else None

    def fetchall(self):
        return list(self._iter) if self._iter is not None else []

class TursoConnection:
    """Conexión persistente a Turso Cloud SQLite"""
    def __init__(self, url, token):
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        self.client = libsql_client.create_client_sync(url, auth_token=token)

    def cursor(self):
        return TursoCursor(self.client)

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        try:
            self.client.close()
        except Exception:
            pass

def get_db():
    if HAS_LIBSQL and TURSO_DATABASE_URL and TURSO_AUTH_TOKEN:
        try:
            return TursoConnection(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN)
        except Exception as e:
            print(f"[TURSO ERROR] Fallback a SQLite local: {e}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_pw(pw):
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()

def tiene_permiso(cur, rol, accion):
    cur.execute("SELECT * FROM permisos_roles WHERE rol = ?", (rol,))
    row = cur.fetchone()
    if not row:
        return rol == "ADMINISTRADOR"
    return bool(row[accion])

class DispensarioHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path
        params = urllib.parse.parse_qs(url.query)

        if path.startswith("/api/"):
            self.handle_api_get(path, params)
        elif path == "/descargar-excel":
            self.handle_download_excel()
        else:
            super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        path = url.path

        if path.startswith("/api/"):
            content_len = int(self.headers.get('Content-Length', 0))
            post_body = self.rfile.read(content_len)
            try:
                data = json.loads(post_body.decode('utf-8'))
            except Exception:
                data = {}
            self.handle_api_post(path, data)
        else:
            self.send_error(404, "Not found")

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def handle_download_excel(self):
        conn = get_db()
        try:
            excel_bytes = generar_excel_en_memoria(conn)
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"MEDICINAS_Y_CONTROL_FYDI_{timestamp_str}.xlsx"

            self.send_response(200)
            self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.send_header("Content-Length", str(len(excel_bytes)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(excel_bytes)
        except Exception as e:
            self.send_error(500, f"Error al generar Excel: {str(e)}")
        finally:
            conn.close()

    def handle_api_get(self, path, params):
        conn = get_db()
        cur = conn.cursor()

        try:
            if path == "/api/medicamentos":
                q = params.get("q", [""])[0].strip().lower()
                cat = params.get("cat", [""])[0].strip()
                sql = """
                    SELECT id, codigo, nombre, presentacion, concentracion, categoria, 
                           marcas_comerciales, stock_actual, stock_minimo, unidad_medida, activo
                    FROM medicamentos WHERE activo = 1
                """
                args = []
                if cat:
                    sql += " AND categoria = ?"
                    args.append(cat)
                if q:
                    sql += " AND (lower(nombre) LIKE ? OR lower(marcas_comerciales) LIKE ? OR lower(codigo) LIKE ?)"
                    args.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
                sql += " ORDER BY categoria DESC, nombre ASC"
                cur.execute(sql, args)
                rows = [dict(r) for r in cur.fetchall()]
                for r in rows:
                    if r["stock_actual"] == 0:
                        r["estado"] = "AGOTADO"
                        r["alerta_clase"] = "danger"
                    elif r["stock_actual"] <= r["stock_minimo"]:
                        r["estado"] = "STOCK BAJO"
                        r["alerta_clase"] = "warning"
                    else:
                        r["estado"] = "DISPONIBLE"
                        r["alerta_clase"] = "success"
                self.send_json(rows)

            elif path == "/api/pacientes":
                q = params.get("q", [""])[0].strip().lower()
                sql = """
                    SELECT p.id, p.cedula, p.nombres, p.apellidos, p.edad, p.celular, p.piso_area,
                           COUNT(CASE WHEN a.estado != 'ANULADA' THEN a.id END) as total_atenciones,
                           MAX(CASE WHEN a.estado != 'ANULADA' THEN a.fecha END) as ultima_visita
                    FROM pacientes p
                    LEFT JOIN atenciones a ON p.id = a.paciente_id
                """
                args = []
                if q:
                    sql += " WHERE (lower(p.nombres) LIKE ? OR lower(p.apellidos) LIKE ? OR p.cedula LIKE ?)"
                    args.extend([f"%{q}%", f"%{q}%", f"%{q}%"])
                sql += " GROUP BY p.id ORDER BY p.nombres ASC, p.apellidos ASC"
                cur.execute(sql, args)
                self.send_json([dict(r) for r in cur.fetchall()])

            elif path.startswith("/api/pacientes/") and path.endswith("/historial"):
                parts = path.split("/")
                pid = int(parts[3])
                cur.execute("SELECT * FROM pacientes WHERE id = ?", (pid,))
                pac = cur.fetchone()
                if not pac:
                    self.send_json({"error": "Paciente no encontrado"}, 404)
                    return
                pac_dict = dict(pac)
                
                cur.execute("""
                    SELECT a.id, a.fecha, a.diagnostico, a.observaciones, 
                           COALESCE(a.estado, 'ACTIVA') as estado,
                           a.motivo_anulacion, a.anulado_por, a.anulado_en,
                           COALESCE(a.usuario_registro, 'enfermeria') as usuario_registro
                    FROM atenciones a
                    WHERE a.paciente_id = ?
                    ORDER BY a.fecha DESC, a.id DESC
                """, (pid,))
                atenciones = [dict(r) for r in cur.fetchall()]
                for at in atenciones:
                    cur.execute("""
                        SELECT m.nombre, m.presentacion, m.codigo, d.cantidad
                        FROM despachos d
                        JOIN medicamentos m ON d.medicamento_id = m.id
                        WHERE d.atencion_id = ?
                    """, (at["id"],))
                    at["medicamentos"] = [dict(m) for m in cur.fetchall()]
                pac_dict["historial"] = atenciones
                self.send_json(pac_dict)

            elif path == "/api/atenciones":
                lim = int(params.get("limit", [60])[0])
                cur.execute("""
                    SELECT a.id, a.fecha, p.nombres, p.apellidos, p.cedula, p.piso_area, 
                           a.diagnostico, a.observaciones,
                           COALESCE(a.estado, 'ACTIVA') as estado,
                           a.motivo_anulacion, a.anulado_por, a.anulado_en,
                           COALESCE(a.usuario_registro, 'enfermeria') as usuario_registro
                    FROM atenciones a
                    JOIN pacientes p ON a.paciente_id = p.id
                    ORDER BY a.fecha DESC, a.id DESC
                    LIMIT ?
                """, (lim,))
                atenciones = [dict(r) for r in cur.fetchall()]
                for at in atenciones:
                    cur.execute("""
                        SELECT m.nombre, m.presentacion, d.cantidad
                        FROM despachos d
                        JOIN medicamentos m ON d.medicamento_id = m.id
                        WHERE d.atencion_id = ?
                    """, (at["id"],))
                    at["medicamentos"] = [dict(m) for m in cur.fetchall()]
                self.send_json(atenciones)

            elif path == "/api/kardex":
                mid = params.get("medicamento_id", [None])[0]
                sql = """
                    SELECT k.id, k.fecha, m.codigo, m.nombre, m.presentacion,
                           k.tipo_movimiento, k.concepto, k.cantidad, k.stock_anterior, k.stock_nuevo,
                           COALESCE(k.usuario_registro, 'sistema') as usuario_registro
                    FROM kardex k
                    JOIN medicamentos m ON k.medicamento_id = m.id
                """
                args = []
                if mid:
                    sql += " WHERE k.medicamento_id = ?"
                    args.append(mid)
                sql += " ORDER BY k.fecha DESC, k.id DESC LIMIT 150"
                cur.execute(sql, args)
                self.send_json([dict(r) for r in cur.fetchall()])

            elif path == "/api/permisos":
                cur.execute("SELECT * FROM permisos_roles ORDER BY rol ASC")
                self.send_json([dict(r) for r in cur.fetchall()])

            elif path == "/api/estadisticas":
                cur.execute("SELECT sum(stock_actual), count(*) FROM medicamentos WHERE activo=1")
                tot_unid, tot_meds = cur.fetchone()
                cur.execute("SELECT count(*) FROM pacientes")
                tot_pacs = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM atenciones WHERE estado != 'ANULADA'")
                tot_atenc = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM atenciones WHERE estado = 'ANULADA'")
                tot_anuladas = cur.fetchone()[0]

                cur.execute("SELECT count(*) FROM medicamentos WHERE stock_actual = 0 AND activo=1")
                agotados = cur.fetchone()[0]
                cur.execute("SELECT count(*) FROM medicamentos WHERE stock_actual > 0 AND stock_actual <= stock_minimo AND activo=1")
                bajos = cur.fetchone()[0]

                # Top 10 más consumidos (solo atenciones activas)
                cur.execute("""
                    SELECT m.codigo, m.nombre, m.presentacion, sum(d.cantidad) as total_consumido
                    FROM despachos d
                    JOIN medicamentos m ON d.medicamento_id = m.id
                    JOIN atenciones a ON d.atencion_id = a.id
                    WHERE a.estado != 'ANULADA'
                    GROUP BY m.id
                    ORDER BY total_consumido DESC
                    LIMIT 10
                """)
                top_mas = [dict(r) for r in cur.fetchall()]

                # Top 10 menos consumidos (solo atenciones activas)
                cur.execute("""
                    SELECT m.codigo, m.nombre, m.presentacion, 
                           COALESCE(sum(CASE WHEN a.estado != 'ANULADA' THEN d.cantidad ELSE 0 END), 0) as total_consumido, 
                           m.stock_actual
                    FROM medicamentos m
                    LEFT JOIN despachos d ON m.id = d.medicamento_id
                    LEFT JOIN atenciones a ON d.atencion_id = a.id
                    WHERE m.activo = 1
                    GROUP BY m.id
                    ORDER BY total_consumido ASC, m.stock_actual DESC
                    LIMIT 10
                """)
                top_menos = [dict(r) for r in cur.fetchall()]

                cur.execute("""
                    SELECT diagnostico, count(*) as cantidad
                    FROM atenciones
                    WHERE diagnostico IS NOT NULL AND trim(diagnostico) != '' AND estado != 'ANULADA'
                    GROUP BY trim(upper(diagnostico))
                    ORDER BY cantidad DESC
                    LIMIT 6
                """)
                top_diag = [dict(r) for r in cur.fetchall()]

                cur.execute("""
                    SELECT strftime('%Y-%m', fecha) as mes, count(*) as atenciones
                    FROM atenciones
                    WHERE estado != 'ANULADA'
                    GROUP BY mes
                    ORDER BY mes ASC
                """)
                mensual = [dict(r) for r in cur.fetchall()]

                self.send_json({
                    "totales": {
                        "unidades_bodega": tot_unid or 0,
                        "items_catalogo": tot_meds or 0,
                        "pacientes": tot_pacs or 0,
                        "atenciones": tot_atenc or 0,
                        "atenciones_anuladas": tot_anuladas or 0,
                        "agotados": agotados,
                        "stock_bajo": bajos
                    },
                    "mas_consumidos": top_mas,
                    "menos_consumidos": top_menos,
                    "top_diagnosticos": top_diag,
                    "atenciones_mensuales": mensual
                })

            else:
                self.send_json({"error": "Ruta no encontrada"}, 404)
        finally:
            conn.close()

    def handle_api_post(self, path, data):
        conn = get_db()
        cur = conn.cursor()

        try:
            # ---------------------------------------------------------
            # 1. AUTENTICACIÓN
            # ---------------------------------------------------------
            if path == "/api/auth/login":
                usuario = data.get("usuario", "").strip().lower()
                password = data.get("password", "").strip()

                if not usuario or not password:
                    self.send_json({"error": "Debe ingresar usuario y contraseña."}, 400)
                    return

                # Normalización inteligente de alias
                if usuario in ("enfermera", "enfermería", "nurse"):
                    usuario = "enfermeria"
                elif usuario in ("administrador", "adminfydi"):
                    usuario = "admin"
                elif usuario in ("auditora", "auditoria", "auditoría"):
                    usuario = "auditor"

                p_hash = hash_pw(password)
                cur.execute("""
                    SELECT id, usuario, nombre_completo, rol, activo, password_hash
                    FROM usuarios
                    WHERE lower(usuario) = ? AND activo = 1
                """, (usuario,))
                user = cur.fetchone()

                valido = False
                if user:
                    if user["password_hash"] == p_hash:
                        valido = True
                    # Compatibilidad con alias comunes de contraseña
                    elif usuario == "enfermeria" and password in ("enfermeria123", "enfermera123"):
                        valido = True
                    elif usuario == "admin" and password in ("admin123", "admin"):
                        valido = True
                    elif usuario == "auditor" and password in ("auditor123", "auditor"):
                        valido = True

                if not user or not valido:
                    self.send_json({"error": "Credenciales inválidas. Compruebe el usuario o contraseña."}, 401)
                    return

                token = hashlib.sha256(f"{user['usuario']}:{datetime.now().isoformat()}".encode()).hexdigest()[:24]

                self.send_json({
                    "success": True,
                    "token": token,
                    "usuario": user["usuario"],
                    "nombre_completo": user["nombre_completo"],
                    "rol": user["rol"]
                })

            # ---------------------------------------------------------
            # 2. REGISTRO DE ATENCIONES (CON TRAZABILIDAD DE USUARIO)
            # ---------------------------------------------------------
            elif path == "/api/atenciones":
                user_role = data.get("user_role", "ENFERMERIA").upper()
                usuario_nombre = data.get("usuario_nombre", "Enfermería")
                
                if not tiene_permiso(cur, user_role, "registrar_atenciones"):
                    self.send_json({"error": f"El rol '{user_role}' no tiene permiso para registrar atenciones médicas."}, 403)
                    return

                fecha = data.get("fecha") or datetime.now().strftime("%Y-%m-%d")
                paciente_data = data.get("paciente", {})
                diagnostico = data.get("diagnostico", "Consulta médica").strip()
                observaciones = data.get("observaciones", "").strip()
                medicamentos = data.get("medicamentos", [])

                if not medicamentos:
                    self.send_json({"error": "Debe incluir al menos un medicamento."}, 400)
                    return

                # Validar stock primero
                for item in medicamentos:
                    mid = item.get("medicamento_id")
                    cant = int(item.get("cantidad", 1))
                    cur.execute("SELECT nombre, stock_actual FROM medicamentos WHERE id = ?", (mid,))
                    med_row = cur.fetchone()
                    if not med_row:
                        self.send_json({"error": f"Medicamento con ID {mid} no existe."}, 400)
                        return
                    if med_row["stock_actual"] < cant:
                        self.send_json({
                            "error": f"Stock insuficiente para '{med_row['nombre']}'. Solicitado: {cant}, Disponible en bodega: {med_row['stock_actual']}."
                        }, 400)
                        return

                pid = paciente_data.get("id")
                if not pid:
                    cedula = paciente_data.get("cedula", "").strip()
                    nombres = paciente_data.get("nombres", "").strip().upper()
                    apellidos = paciente_data.get("apellidos", "").strip().upper()
                    edad = paciente_data.get("edad")
                    celular = paciente_data.get("celular", "").strip()
                    piso = paciente_data.get("piso_area", "").strip()

                    if not nombres:
                        self.send_json({"error": "Debe especificar el nombre del paciente."}, 400)
                        return

                    if cedula:
                        cur.execute("SELECT id FROM pacientes WHERE cedula = ?", (cedula,))
                        found = cur.fetchone()
                        if found:
                            pid = found["id"]
                    
                    if not pid:
                        cur.execute("SELECT id FROM pacientes WHERE nombres = ? AND apellidos = ?", (nombres, apellidos))
                        found = cur.fetchone()
                        if found:
                            pid = found["id"]

                    if not pid:
                        cur.execute("""
                            INSERT INTO pacientes (cedula, nombres, apellidos, edad, celular, piso_area, creado_en)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (cedula if cedula else None, nombres, apellidos, edad, celular, piso))
                        pid = cur.lastrowid
                    else:
                        cur.execute("""
                            UPDATE pacientes SET 
                                edad = COALESCE(?, edad),
                                celular = CASE WHEN ? != '' THEN ? ELSE celular END,
                                piso_area = CASE WHEN ? != '' THEN ? ELSE piso_area END
                            WHERE id = ?
                        """, (edad, celular, celular, piso, piso, pid))

                # Registrar atención con trazabilidad de usuario y estado ACTIVA
                usuario_tag = f"{usuario_nombre} ({user_role})"
                cur.execute("""
                    INSERT INTO atenciones (fecha, paciente_id, diagnostico, observaciones, estado, usuario_registro, creado_en)
                    VALUES (?, ?, ?, ?, 'ACTIVA', ?, datetime('now'))
                """, (fecha, pid, diagnostico, observaciones, usuario_tag))
                atencion_id = cur.lastrowid

                cur.execute("SELECT nombres, apellidos FROM pacientes WHERE id = ?", (pid,))
                p_row = cur.fetchone()
                p_name = f"{p_row['nombres']} {p_row['apellidos']}".strip()

                despachados_info = []
                for item in medicamentos:
                    mid = item.get("medicamento_id")
                    cant = int(item.get("cantidad", 1))

                    cur.execute("SELECT stock_actual, nombre, presentacion FROM medicamentos WHERE id = ?", (mid,))
                    med = cur.fetchone()
                    stock_prev = med["stock_actual"]
                    stock_new = stock_prev - cant

                    cur.execute("UPDATE medicamentos SET stock_actual = ? WHERE id = ?", (stock_new, mid))

                    cur.execute("""
                        INSERT INTO despachos (atencion_id, medicamento_id, cantidad)
                        VALUES (?, ?, ?)
                    """, (atencion_id, mid, cant))

                    cur.execute("""
                        INSERT INTO kardex (fecha, medicamento_id, tipo_movimiento, referencia_id, concepto, cantidad, stock_anterior, stock_nuevo, creado_en, usuario_registro)
                        VALUES (?, ?, 'SALIDA_ATENCION', ?, ?, ?, ?, ?, datetime('now'), ?)
                    """, (fecha, mid, atencion_id, f"Despacho paciente: {p_name} ({diagnostico})", cant, stock_prev, stock_new, usuario_tag))

                    despachados_info.append({
                        "medicamento": med["nombre"],
                        "presentacion": med["presentacion"],
                        "cantidad": cant,
                        "stock_restante": stock_new
                    })

                conn.commit()
                self.send_json({
                    "success": True,
                    "mensaje": "Atención y despacho registrados con éxito. El inventario se actualizó automáticamente.",
                    "atencion_id": atencion_id,
                    "paciente": p_name,
                    "despacho": despachados_info
                }, 201)

            # ---------------------------------------------------------
            # 3. ANULAR ATENCIÓN Y REVERTIR STOCK AUTOMÁTICAMENTE
            # ---------------------------------------------------------
            elif path == "/api/atenciones/anular":
                user_role = (data.get("user_role") or data.get("rol") or "").upper()
                usuario_nombre = data.get("usuario_nombre") or data.get("usuario_anula") or "Usuario"
                atencion_id = data.get("atencion_id")
                motivo = (data.get("motivo_anulacion") or data.get("motivo") or "").strip()

                if not tiene_permiso(cur, user_role, "anular_atenciones"):
                    self.send_json({"error": f"El rol '{user_role}' no tiene autorización para anular atenciones o revertir stock. Contacte al Administrador."}, 403)
                    return

                if not atencion_id or not motivo:
                    self.send_json({"error": "Debe especificar el ID de la atención y el motivo justificado de la anulación."}, 400)
                    return

                cur.execute("""
                    SELECT a.id, a.fecha, a.estado, p.nombres || ' ' || p.apellidos as paciente
                    FROM atenciones a
                    JOIN pacientes p ON a.paciente_id = p.id
                    WHERE a.id = ?
                """, (atencion_id,))
                at = cur.fetchone()
                if not at:
                    self.send_json({"error": f"La atención #{atencion_id} no existe."}, 404)
                    return

                if at["estado"] == "ANULADA":
                    self.send_json({"error": f"La atención #{atencion_id} ya fue anulada previamente."}, 400)
                    return

                # Revertir cada despacho de la atención
                cur.execute("""
                    SELECT d.medicamento_id, d.cantidad, m.nombre, m.presentacion, m.stock_actual
                    FROM despachos d
                    JOIN medicamentos m ON d.medicamento_id = m.id
                    WHERE d.atencion_id = ?
                """, (atencion_id,))
                despachos = cur.fetchall()

                usuario_tag = f"{usuario_nombre} ({user_role})"
                revertidos = []

                for d in despachos:
                    mid = d["medicamento_id"]
                    cant = d["cantidad"]
                    stock_prev = d["stock_actual"]
                    stock_new = stock_prev + cant

                    # Devolver stock a la bodega
                    cur.execute("UPDATE medicamentos SET stock_actual = ? WHERE id = ?", (stock_new, mid))

                    # Asentar en Kardex la devolución oficial
                    concepto = f"Devolución por anulación atención #{atencion_id} ({at['paciente']}): {motivo}"
                    cur.execute("""
                        INSERT INTO kardex (fecha, medicamento_id, tipo_movimiento, referencia_id, concepto, cantidad, stock_anterior, stock_nuevo, creado_en, usuario_registro)
                        VALUES (date('now'), ?, 'REVERSION_ANULACION', ?, ?, ?, ?, ?, datetime('now'), ?)
                    """, (mid, atencion_id, concepto, cant, stock_prev, stock_new, usuario_tag))

                    revertidos.append({
                        "medicamento": d["nombre"],
                        "presentacion": d["presentacion"],
                        "devueltos": cant,
                        "stock_nuevo": stock_new
                    })

                # Marcar la atención como ANULADA
                cur.execute("""
                    UPDATE atenciones SET
                        estado = 'ANULADA',
                        motivo_anulacion = ?,
                        anulado_por = ?,
                        anulado_en = datetime('now')
                    WHERE id = ?
                """, (motivo, usuario_tag, atencion_id))

                conn.commit()
                self.send_json({
                    "success": True,
                    "mensaje": f"Atención #{atencion_id} anulada con éxito. Las medicinas fueron devueltas a bodega y el Kardex fue actualizado.",
                    "revertidos": revertidos
                })

            # ---------------------------------------------------------
            # 3.1 CREAR NUEVO PACIENTE (SIN CONSULTA NI MEDICINAS OBLIGATORIAS)
            # ---------------------------------------------------------
            elif path == "/api/pacientes":
                user_role = (data.get("user_role") or data.get("rol") or "ENFERMERIA").upper()
                if user_role == "AUDITOR":
                    self.send_json({"error": "El rol AUDITOR no tiene permisos para crear pacientes."}, 403)
                    return

                cedula = (data.get("cedula") or "").strip()
                nombres = (data.get("nombres") or "").strip().upper()
                apellidos = (data.get("apellidos") or "").strip().upper()
                edad = data.get("edad")
                celular = (data.get("celular") or "").strip()
                piso = (data.get("piso_area") or "").strip()

                if not nombres:
                    self.send_json({"error": "El nombre del paciente o trabajador es obligatorio."}, 400)
                    return

                if cedula:
                    cur.execute("SELECT id, nombres, apellidos FROM pacientes WHERE cedula = ?", (cedula,))
                    existente = cur.fetchone()
                    if existente:
                        self.send_json({"error": f"Ya existe un paciente registrado con la cédula {cedula} ({existente['nombres']} {existente['apellidos']})."}, 400)
                        return

                cur.execute("""
                    INSERT INTO pacientes (cedula, nombres, apellidos, edad, celular, piso_area, creado_en)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                """, (cedula if cedula else None, nombres, apellidos, edad if edad else None, celular, piso))
                conn.commit()
                pid = cur.lastrowid

                self.send_json({
                    "success": True,
                    "mensaje": f"Paciente '{nombres} {apellidos}' registrado exitosamente en el directorio clínico.",
                    "paciente_id": pid
                }, 201)

            # ---------------------------------------------------------
            # 3.2 EDITAR PACIENTE EXISTENTE (CORRECCIÓN DE DATOS)
            # ---------------------------------------------------------
            elif path == "/api/pacientes/editar":
                user_role = (data.get("user_role") or data.get("rol") or "ENFERMERIA").upper()
                if user_role == "AUDITOR":
                    self.send_json({"error": "El rol AUDITOR no tiene permisos para editar pacientes."}, 403)
                    return

                pid = data.get("id")
                cedula = (data.get("cedula") or "").strip()
                nombres = (data.get("nombres") or "").strip().upper()
                apellidos = (data.get("apellidos") or "").strip().upper()
                edad = data.get("edad")
                celular = (data.get("celular") or "").strip()
                piso = (data.get("piso_area") or "").strip()

                if not pid:
                    self.send_json({"error": "Debe especificar el ID del paciente a editar."}, 400)
                    return

                if not nombres:
                    self.send_json({"error": "El nombre del paciente es obligatorio."}, 400)
                    return

                cur.execute("SELECT id FROM pacientes WHERE id = ?", (pid,))
                if not cur.fetchone():
                    self.send_json({"error": f"Paciente #{pid} no encontrado."}, 404)
                    return

                if cedula:
                    cur.execute("SELECT id, nombres, apellidos FROM pacientes WHERE cedula = ? AND id != ?", (cedula, pid))
                    otro = cur.fetchone()
                    if otro:
                        self.send_json({"error": f"La cédula {cedula} ya está asignada a otro paciente ({otro['nombres']} {otro['apellidos']})."}, 400)
                        return

                cur.execute("""
                    UPDATE pacientes SET
                        cedula = ?,
                        nombres = ?,
                        apellidos = ?,
                        edad = ?,
                        celular = ?,
                        piso_area = ?
                    WHERE id = ?
                """, (cedula if cedula else None, nombres, apellidos, edad if edad else None, celular, piso, pid))
                conn.commit()

                self.send_json({
                    "success": True,
                    "mensaje": f"Datos del paciente '{nombres} {apellidos}' actualizados correctamente."
                })

            # ---------------------------------------------------------
            # 4. REGISTRO DE ENTRADAS A BODEGA
            # ---------------------------------------------------------
            elif path == "/api/entradas":
                user_role = data.get("user_role", "ENFERMERIA").upper()
                usuario_nombre = data.get("usuario_nombre", "Usuario")

                if not tiene_permiso(cur, user_role, "registrar_entradas"):
                    self.send_json({"error": f"El rol '{user_role}' no tiene permiso para registrar entradas a bodega."}, 403)
                    return

                mid = data.get("medicamento_id")
                cant = int(data.get("cantidad", 0))
                proveedor = data.get("proveedor", "Compra / Reposición").strip()
                factura = data.get("factura", "").strip()
                lote = data.get("lote", "").strip()
                fecha = data.get("fecha") or datetime.now().strftime("%Y-%m-%d")
                obs = data.get("observaciones", "").strip()

                if not mid or cant <= 0:
                    self.send_json({"error": "Datos de entrada inválidos. Debe especificar medicamento y cantidad mayor a 0."}, 400)
                    return

                cur.execute("SELECT nombre, presentacion, stock_actual FROM medicamentos WHERE id = ?", (mid,))
                med = cur.fetchone()
                if not med:
                    self.send_json({"error": "Medicamento no encontrado."}, 404)
                    return

                prev_stock = med["stock_actual"]
                new_stock = prev_stock + cant

                cur.execute("UPDATE medicamentos SET stock_actual = ? WHERE id = ?", (new_stock, mid))

                concepto = f"Entrada Bodega: {proveedor}"
                if factura:
                    concepto += f" | Factura: {factura}"
                if lote:
                    concepto += f" | Lote: {lote}"
                if obs:
                    concepto += f" | Obs: {obs}"

                usuario_tag = f"{usuario_nombre} ({user_role})"
                cur.execute("""
                    INSERT INTO kardex (fecha, medicamento_id, tipo_movimiento, concepto, cantidad, stock_anterior, stock_nuevo, creado_en, usuario_registro)
                    VALUES (?, ?, 'ENTRADA', ?, ?, ?, ?, datetime('now'), ?)
                """, (fecha, mid, concepto, cant, prev_stock, new_stock, usuario_tag))

                conn.commit()
                self.send_json({
                    "success": True,
                    "mensaje": f"Se ingresaron {cant} unidades a '{med['nombre']}'. Nuevo stock en bodega: {new_stock}.",
                    "nuevo_stock": new_stock
                }, 201)

            # ---------------------------------------------------------
            # 5. MODIFICAR O CREAR MEDICAMENTO (PERMISO)
            # ---------------------------------------------------------
            elif path == "/api/medicamentos/guardar":
                user_role = data.get("user_role", "").upper()
                if not tiene_permiso(cur, user_role, "gestionar_medicamentos"):
                    self.send_json({"error": f"El rol '{user_role}' no tiene autorización para modificar el catálogo de medicamentos."}, 403)
                    return

                mid = data.get("id")
                codigo = data.get("codigo", "").strip().upper()
                nombre = data.get("nombre", "").strip().upper()
                presentacion = data.get("presentacion", "").strip()
                concentracion = data.get("concentracion", "").strip()
                categoria = data.get("categoria", "Medicamento").strip()
                marcas = data.get("marcas_comerciales", "").strip()
                stock_minimo = int(data.get("stock_minimo", 10))

                if not nombre:
                    self.send_json({"error": "El nombre del medicamento es obligatorio."}, 400)
                    return

                if mid:
                    cur.execute("SELECT nombre, stock_actual FROM medicamentos WHERE id = ?", (mid,))
                    med_existente = cur.fetchone()
                    if not med_existente:
                        self.send_json({"error": "Medicamento no encontrado."}, 404)
                        return

                    prev_stock = med_existente["stock_actual"]
                    nuevo_stock_val = data.get("stock_actual")
                    if nuevo_stock_val is not None:
                        nuevo_stock = max(0, int(nuevo_stock_val))
                    else:
                        nuevo_stock = prev_stock

                    stock_cambiado = (nuevo_stock != prev_stock)
                    motivo_ajuste = data.get("motivo_ajuste", "").strip()
                    admin_nombre = data.get("admin_nombre", "Administrador")

                    if stock_cambiado:
                        if not tiene_permiso(cur, user_role, "ajustar_stock"):
                            self.send_json({"error": f"El rol '{user_role}' no tiene permiso para modificar el stock actual."}, 403)
                            return

                        delta = nuevo_stock - prev_stock
                        motivo_desc = motivo_ajuste if motivo_ajuste else "Ajuste directo de stock físico en edición de catálogo"
                        concepto = f"Ajuste en edición ({admin_nombre}): {motivo_desc} | Anterior: {prev_stock} -> Nuevo: {nuevo_stock}"

                        cur.execute("""
                            INSERT INTO kardex (fecha, medicamento_id, tipo_movimiento, concepto, cantidad, stock_anterior, stock_nuevo, creado_en, usuario_registro)
                            VALUES (date('now'), ?, 'AJUSTE_AUDITORIA', ?, ?, ?, ?, datetime('now'), ?)
                        """, (mid, concepto, abs(delta), prev_stock, nuevo_stock, f"{admin_nombre} ({user_role})"))

                    cur.execute("""
                        UPDATE medicamentos SET
                            nombre = ?,
                            presentacion = ?,
                            concentracion = ?,
                            categoria = ?,
                            marcas_comerciales = ?,
                            stock_minimo = ?,
                            stock_actual = ?
                        WHERE id = ?
                    """, (nombre, presentacion, concentracion, categoria, marcas, stock_minimo, nuevo_stock, mid))
                    conn.commit()

                    if stock_cambiado:
                        msg = f"Medicamento '{nombre}' actualizado. Stock ajustado de {prev_stock} a {nuevo_stock} unidades (asentado en Kardex)."
                    else:
                        msg = f"Medicamento '{nombre}' actualizado correctamente."

                    self.send_json({"success": True, "mensaje": msg, "nuevo_stock": nuevo_stock})
                else:
                    if not codigo:
                        prefix = "INS" if categoria == "Insumo Médico" else "MED"
                        cur.execute("SELECT count(*) FROM medicamentos WHERE categoria = ?", (categoria,))
                        cnt = cur.fetchone()[0] + 1
                        codigo = f"{prefix}-{cnt:03d}"

                    stock_inicial = int(data.get("stock_actual", data.get("stock_inicial", 0)))
                    cur.execute("""
                        INSERT INTO medicamentos (codigo, nombre, presentacion, concentracion, categoria, marcas_comerciales, stock_actual, stock_minimo)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (codigo, nombre, presentacion, concentracion, categoria, marcas, stock_inicial, stock_minimo))
                    new_id = cur.lastrowid

                    if stock_inicial > 0:
                        admin_nombre = data.get("admin_nombre", "Administrador")
                        cur.execute("""
                            INSERT INTO kardex (fecha, medicamento_id, tipo_movimiento, concepto, cantidad, stock_anterior, stock_nuevo, creado_en, usuario_registro)
                            VALUES (date('now'), ?, 'INVENTARIO_INICIAL', 'Alta de nuevo producto en catálogo', ?, 0, ?, datetime('now'), ?)
                        """, (new_id, stock_inicial, stock_inicial, f"{admin_nombre} ({user_role})"))

                    conn.commit()
                    self.send_json({"success": True, "mensaje": f"Nuevo producto '{nombre}' registrado con código {codigo} y stock inicial de {stock_inicial} unidades."})

            # ---------------------------------------------------------
            # 6. AJUSTE MANUAL DE STOCK (PERMISO)
            # ---------------------------------------------------------
            elif path == "/api/medicamentos/ajuste-stock":
                user_role = data.get("user_role", "").upper()
                if not tiene_permiso(cur, user_role, "ajustar_stock"):
                    self.send_json({"error": f"El rol '{user_role}' no tiene permiso para realizar ajustes manuales de stock."}, 403)
                    return

                mid = data.get("medicamento_id")
                nuevo_stock = int(data.get("nuevo_stock", 0))
                motivo = data.get("motivo", "").strip()
                admin_nombre = data.get("admin_nombre", "Administrador").strip()

                if not mid or nuevo_stock < 0:
                    self.send_json({"error": "Parámetros de ajuste inválidos."}, 400)
                    return

                if not motivo:
                    self.send_json({"error": "Debe especificar un motivo justificado para el ajuste de stock (Auditoría)."}, 400)
                    return

                cur.execute("SELECT nombre, presentacion, stock_actual FROM medicamentos WHERE id = ?", (mid,))
                med = cur.fetchone()
                if not med:
                    self.send_json({"error": "Medicamento no encontrado."}, 404)
                    return

                prev_stock = med["stock_actual"]
                delta = nuevo_stock - prev_stock

                cur.execute("UPDATE medicamentos SET stock_actual = ? WHERE id = ?", (nuevo_stock, mid))

                concepto = f"Ajuste Auditoría ({admin_nombre}): {motivo} | Anterior: {prev_stock} -> Nuevo: {nuevo_stock}"
                cur.execute("""
                    INSERT INTO kardex (fecha, medicamento_id, tipo_movimiento, concepto, cantidad, stock_anterior, stock_nuevo, creado_en, usuario_registro)
                    VALUES (date('now'), ?, 'AJUSTE_AUDITORIA', ?, ?, ?, ?, datetime('now'), ?)
                """, (mid, concepto, abs(delta), prev_stock, nuevo_stock, f"{admin_nombre} ({user_role})"))

                conn.commit()
                self.send_json({
                    "success": True,
                    "mensaje": f"Stock de '{med['nombre']}' ajustado de {prev_stock} a {nuevo_stock} unidades. Asentado en Kardex.",
                    "nuevo_stock": nuevo_stock
                })

            # ---------------------------------------------------------
            # 7. GUARDAR PERMISOS DE ROLES (ADMINISTRADOR)
            # ---------------------------------------------------------
            elif path == "/api/permisos":
                user_role = data.get("user_role", "").upper()
                if user_role != "ADMINISTRADOR":
                    self.send_json({"error": "Solo el Administrador puede configurar la matriz de permisos."}, 403)
                    return

                permisos = data.get("permisos", [])
                for p in permisos:
                    rol = p.get("rol")
                    if rol:
                        cur.execute("""
                            UPDATE permisos_roles SET
                                registrar_atenciones = ?,
                                anular_atenciones = ?,
                                registrar_entradas = ?,
                                ajustar_stock = ?,
                                gestionar_medicamentos = ?,
                                gestionar_permisos = ?,
                                descargar_excel = ?
                            WHERE rol = ?
                        """, (
                            int(p.get("registrar_atenciones", 0)),
                            int(p.get("anular_atenciones", 0)),
                            int(p.get("registrar_entradas", 0)),
                            int(p.get("ajustar_stock", 0)),
                            int(p.get("gestionar_medicamentos", 0)),
                            int(p.get("gestionar_permisos", 0)),
                            int(p.get("descargar_excel", 1)),
                            rol
                        ))
                conn.commit()
                self.send_json({"success": True, "mensaje": "Matriz de permisos actualizada exitosamente."})

            else:
                self.send_json({"error": "Ruta no encontrada"}, 404)

        except Exception as e:
            conn.rollback()
            self.send_json({"error": str(e)}, 500)
        finally:
            conn.close()

def init_system_tables():
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nombre_completo TEXT NOT NULL,
                rol TEXT NOT NULL,
                activo INTEGER DEFAULT 1,
                creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS permisos_roles (
                rol TEXT PRIMARY KEY,
                registrar_atenciones INTEGER DEFAULT 1,
                anular_atenciones INTEGER DEFAULT 0,
                registrar_entradas INTEGER DEFAULT 0,
                ajustar_stock INTEGER DEFAULT 0,
                gestionar_medicamentos INTEGER DEFAULT 0,
                gestionar_permisos INTEGER DEFAULT 0,
                descargar_excel INTEGER DEFAULT 1
            )
        """)
        users_to_ensure = [
            ("admin", hash_pw("admin123"), "Administrador General FYDI", "ADMINISTRADOR"),
            ("enfermeria", hash_pw("enfermeria123"), "Lic. Enfermería Dispensario", "ENFERMERIA"),
            ("auditor", hash_pw("auditor123"), "Auditoría Médica y Sanitaria", "AUDITOR")
        ]
        for u, p, n, r in users_to_ensure:
            cur.execute("SELECT id FROM usuarios WHERE lower(usuario) = ?", (u.lower(),))
            row = cur.fetchone()
            if not row:
                cur.execute("INSERT INTO usuarios (usuario, password_hash, nombre_completo, rol, activo) VALUES (?, ?, ?, ?, 1)", (u, p, n, r))
            else:
                cur.execute("UPDATE usuarios SET password_hash = ?, nombre_completo = ?, rol = ?, activo = 1 WHERE lower(usuario) = ?", (p, n, r, u.lower()))

        default_perms = [
            ("ADMINISTRADOR", 1, 1, 1, 1, 1, 1, 1),
            ("ENFERMERIA", 1, 0, 1, 0, 0, 0, 1),
            ("AUDITOR", 0, 0, 0, 0, 0, 0, 1)
        ]
        for r, at, an, en, aj, gm, gp, de in default_perms:
            cur.execute("SELECT rol FROM permisos_roles WHERE rol = ?", (r,))
            if not cur.fetchone():
                cur.execute("INSERT INTO permisos_roles VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (r, at, an, en, aj, gm, gp, de))

        conn.commit()
    except Exception as err:
        print("Warning initializing system tables:", err)
    finally:
        conn.close()

def run_server():
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    init_system_tables()
    server_address = ('', PORT)
    httpd = socketserver.TCPServer(server_address, DispensarioHandler)
    print(f"Dispensario FYDI Server running on http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("Server stopped.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
