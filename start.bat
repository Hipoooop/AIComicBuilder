@echo off
chcp 65001 >nul 2>&1
title AIComicBuilder

echo ========================================
echo   AIComicBuilder - Starting...
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18+ first.
    goto :fail
)
echo [OK] Node.js found

:: Check pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] pnpm is not installed. Run: npm install -g pnpm
    goto :fail
)
echo [OK] pnpm found

:: Setup .env if missing
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [OK] .env created from .env.example
    ) else (
        echo [WARN] .env.example not found, skipping .env setup
    )
) else (
    echo [OK] .env already exists
)

:: Install dependencies if missing
if not exist "node_modules\" (
    echo [INFO] Installing dependencies...
    pnpm install
    if %errorlevel% neq 0 (
        echo [ERROR] pnpm install failed
        goto :fail
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] node_modules exists, skipping install
)

:: Start dev server
echo.
echo ========================================
echo   Starting dev server on port 37000
echo   http://localhost:37000
echo ========================================
echo.
pnpm dev
goto :end

:fail
echo.
echo [FAILED] Startup aborted. Check errors above.
pause

:end
