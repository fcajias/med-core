@echo off
title Dispensario Medico FYDI - Sistema de Control y Bodega
chcp 65001 > nul
cls

echo =====================================================================
echo          DISPENSARIO MEDICO FYDI - CONTROL CLINICO Y BODEGA          
echo =====================================================================
echo.
echo  [+] Verificando base de datos y archivos del sistema...
if not exist "%~dp0dispensario_fydi.db" (
    echo  [!] Base de datos no encontrada. Generando datos iniciales...
    python "%~dp0scratch\migrar_y_cuadrar.py"
)

echo  [+] Iniciando servidor local en http://localhost:5000 ...
echo  [+] Abriendo el navegador web automaticamente...
start http://localhost:5000

echo.
echo  =====================================================================
echo   EL SISTEMA ESTA ACTIVO Y OPERANDO CORRECTAMENTE.
echo   Para cerrar el sistema, simplemente cierra esta ventana negra.
echo  =====================================================================
echo.

python "%~dp0server.py"
pause
