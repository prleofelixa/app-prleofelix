@echo off
cd /d "%~dp0"
echo Iniciando o painel PrLeofelix...
echo.
echo Quando aparecer "rodando em http://localhost:4173", abra essa URL no navegador.
echo Para desligar o painel, feche esta janela.
echo.
call npm start
pause
