@echo off
setlocal
cd /d "%~dp0"

REM Busca la IP de la red WiFi para poder entrar desde el celular.
set LANIP=
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.PrefixOrigin -eq 'Dhcp' -and $_.IPAddress -notlike '169.254.*' } ^| Select-Object -First 1 -ExpandProperty IPAddress)"`) do set LANIP=%%i

cls
echo.
echo   ================================================
echo    GASTOS - servidor prendido
echo   ================================================
echo.
echo    En esta compu:   http://localhost:5173
if defined LANIP echo    En el celular:   http://%LANIP%:5173
if not defined LANIP echo    En el celular:   no se detecto la IP de WiFi
echo.
echo    El celular tiene que estar en la misma red WiFi
echo    y esta ventana tiene que quedar abierta.
echo.
echo    Para apagarlo: cerra esta ventana.
echo   ================================================
echo.

start "" http://localhost:5173
python -m http.server 5173 --directory app
