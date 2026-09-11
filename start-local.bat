@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto no_node
if not defined GEMINI_API_KEY if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="GEMINI_API_KEY" set "GEMINI_API_KEY=%%B"
if not defined GEMINI_MODEL if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="GEMINI_MODEL" set "GEMINI_MODEL=%%B"
if not defined OCR_SPACE_API_KEY if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="OCR_SPACE_API_KEY" set "OCR_SPACE_API_KEY=%%B"
if not defined CONSULTADANFE_API_URL if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="CONSULTADANFE_API_URL" set "CONSULTADANFE_API_URL=%%B"
if not defined CONSULTADANFE_API_KEY if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="CONSULTADANFE_API_KEY" set "CONSULTADANFE_API_KEY=%%B"
if not defined CONSULTADANFE_REQUEST_FIELD if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="CONSULTADANFE_REQUEST_FIELD" set "CONSULTADANFE_REQUEST_FIELD=%%B"
if not defined CONSULTADANFE_AUTH_HEADER if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="CONSULTADANFE_AUTH_HEADER" set "CONSULTADANFE_AUTH_HEADER=%%B"
if not defined CONSULTADANFE_AUTH_PREFIX if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="CONSULTADANFE_AUTH_PREFIX" set "CONSULTADANFE_AUTH_PREFIX=%%B"
if not defined CONSULTADANFE_DANFE_URL if exist .env for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /I "%%A"=="CONSULTADANFE_DANFE_URL" set "CONSULTADANFE_DANFE_URL=%%B"
if not defined PORT set PORT=8000
start "JuRe Server" cmd /c "node server.mjs"
timeout /t 2 >nul
start "" http://localhost:%PORT%/
exit /b
:no_node
echo Node.js 18+ e necessario para o servidor local seguro.
echo O OCR local continua disponivel no navegador. Consulta fiscal, IA visual e OCR secundario usam o servidor local. Nao abra index.html diretamente; use este arquivo para iniciar o app.
pause
