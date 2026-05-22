@echo off
cd /d "D:\Claude\monitor de licenciamento"

:: Obtem a data de hoje no formato YYYY-MM-DD, independente do locale do Windows.
for /f "delims=" %%D in ('node -e "process.stdout.write(new Date().toISOString().slice(0,10))"') do set DATA_HOJE=%%D

:: Arquivo de relatorio esperado para hoje (nome usa data ISO).
set RELATORIO=relatorio-%DATA_HOJE%.json

:: Guarda de "uma vez por dia": se o relatorio ja existe, o monitor ja rodou.
if exist "%RELATORIO%" (
  echo [%DATE% %TIME%] Relatorio %RELATORIO% ja existe - monitor ja rodou hoje. Saindo.
  exit /b 0
)

echo [%DATE% %TIME%] Iniciando monitor para %DATA_HOJE%...
node monitor.js
set CODIGO_SAIDA=%ERRORLEVEL%

echo [%DATE% %TIME%] Monitor encerrou com codigo %CODIGO_SAIDA%.
exit /b %CODIGO_SAIDA%
