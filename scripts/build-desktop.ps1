# Gera o programa para Windows: backend\dist\ManagerFinance\ManagerFinance.exe
# O modo web (uvicorn + npm run dev) continua igual; isto só empacota o mesmo código.
#   .\scripts\build-desktop.ps1             gera e instala nesta máquina
#   .\scripts\build-desktop.ps1 -NoInstall  só gera (o instalador e o GitHub Actions usam assim)
param([switch]$NoInstall)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# 1. Frontend estático. A API fica na mesma origem que serve a página (porta = PORT em
#    backend/app/desktop.py; atribuir "" no PowerShell apagaria a variável).
Push-Location "$root\frontend"
try {
    $env:NEXT_OUTPUT = "export"
    $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8765"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "next build falhou" }
} finally {
    Remove-Item Env:NEXT_OUTPUT, Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
    Pop-Location
}

# 2. Backend + frontend num .exe
Push-Location "$root\backend"
try {
    uv sync --group desktop
    if ($LASTEXITCODE -ne 0) { throw "uv sync falhou" }
    # --clean: sem ele o PyInstaller reaproveita o .exe antigo quando só o conteúdo do ícone muda
    uv run pyinstaller managerfinance.spec --noconfirm --clean
    if ($LASTEXITCODE -ne 0) { throw "pyinstaller falhou" }
} finally {
    Pop-Location
}

if ($NoInstall) {
    Write-Host "`nGerado em $root\backend\dist\ManagerFinance"
    exit 0
}

# 3. Instala para o usuário, como os outros apps (fora do OneDrive), com atalho no Menu Iniciar
$install = "$env:LOCALAPPDATA\Programs\ManagerFinance"
if (Get-Process ManagerFinance -ErrorAction SilentlyContinue) {
    throw "Feche o ManagerFinance antes de instalar a nova versao"
}
robocopy "$root\backend\dist\ManagerFinance" $install /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "falha ao copiar para $install" }

$shell = New-Object -ComObject WScript.Shell
$startMenu = [Environment]::GetFolderPath("Programs")
$link = $shell.CreateShortcut("$startMenu\ManagerFinance.lnk")
$link.TargetPath = "$install\ManagerFinance.exe"
$link.WorkingDirectory = $install
$link.Description = "ManagerFinance"
$link.Save()

Write-Host "`nInstalado em $install (atalho no Menu Iniciar)"
