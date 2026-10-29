# Gera o programa para Windows: backend\dist\Finora\Finora.exe e o instalador para distribuir
# O modo web (uvicorn + npm run dev) continua igual; isto só empacota o mesmo código.
#
# Uso:
#   .\scripts\build-desktop.ps1             # gera e instala, com atalho no Menu Iniciar
#   .\scripts\build-desktop.ps1 -NoInstall  # só gera (é o que o GitHub Actions usa)
#
# Com o Inno Setup 6 instalado (https://jrsoftware.org/isinfo.php ou
# `winget install JRSoftware.InnoSetup`) sai o Finora-Windows-Setup.exe; sem ele, um .zip.
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

# 3. Instalador para outros PCs (o equivalente ao .dmg do Mac). Na primeira abertura o
#    programa cria o .env e mostra o onboarding.
$version = (Select-String -Path "$root\backend\pyproject.toml" -Pattern '^version = "(.+)"').Matches[0].Groups[1].Value
$iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
if (-not $iscc) {
    $iscc = @("${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
}
if ($iscc) {
    $dist = "$root\backend\dist\Finora-Windows-Setup.exe"
    & $iscc /Q "/DAppVersion=$version" "$root\backend\packaging\windows\finora.iss"
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup falhou" }
} else {
    # Sem Inno Setup: .zip para extrair e abrir o Finora.exe
    $dist = "$root\backend\dist\Finora-$version-windows.zip"
    Remove-Item $dist -ErrorAction SilentlyContinue
    Compress-Archive -Path "$root\backend\dist\Finora" -DestinationPath $dist
}
if ($NoInstall) {
    Write-Host "`nPara distribuir: $dist"
    exit 0
}

# 4. Instala para o usuário, como os outros apps (fora do OneDrive), com atalho no Menu Iniciar
$install = "$env:LOCALAPPDATA\Programs\Finora"
if (Get-Process Finora -ErrorAction SilentlyContinue) {
    throw "Feche o Finora antes de instalar a nova versao"
}
robocopy "$root\backend\dist\Finora" $install /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "falha ao copiar para $install" }

$shell = New-Object -ComObject WScript.Shell
$startMenu = [Environment]::GetFolderPath("Programs")
$link = $shell.CreateShortcut("$startMenu\Finora.lnk")
$link.TargetPath = "$install\Finora.exe"
$link.WorkingDirectory = $install
$link.Description = "Finora"
$link.Save()

Write-Host "`nInstalado em $install (atalho no Menu Iniciar)"
Write-Host "Para distribuir: $dist"
