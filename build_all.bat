@echo off
setlocal enabledelayedexpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ========================================
echo  Building all arcade room games...
echo ========================================
echo.

for /d %%G in (*) do (
    if exist "%%G\Gulpfile.js" if exist "%%G\package.json" (
        if /i not "%%G"=="racing" (
            echo ----------------------------------------
            echo  Building: %%G
            echo ----------------------------------------
            pushd "%%G"
            if not exist "node_modules" (
                echo    Installing dependencies...
                call npm install --silent
            )
            call npx gulp build
            if !errorlevel! equ 0 (
                echo [OK] %%G built successfully.
            ) else (
                echo [FAILED] %%G build failed!
            )
            popd
            echo.
        )
    )
)

echo ========================================
echo  All builds complete!
echo ========================================
echo.

:ask_package
set /p "PACKAGE=Package the build (npm run package)? (y/n): "
if /i "!PACKAGE!"=="y" (
    echo.
    echo Running npm run package...
    call npm run package
    echo.
    echo Packaging complete!
) else if /i "!PACKAGE!"=="n" (
    echo Skipping packaging.
) else (
    goto ask_package
)

echo Done!
endlocal
