#!/usr/bin/env bash
# Gera o programa para macOS: backend/dist/Finora.app e um .dmg para distribuir.
# O modo web (uvicorn + npm run dev) continua igual; isto só empacota o mesmo código.
#
# Uso:
#   scripts/build-desktop.sh              # gera, assina e instala em /Applications
#   scripts/build-desktop.sh --no-install # só gera o .app e o .dmg
#
# Assinatura (automática):
#   - Com um certificado "Developer ID Application" no Chaveiro, assina com ele (hardened
#     runtime). Se MF_NOTARY_PROFILE estiver definido, também notariza o .dmg na Apple:
#     abre sem aviso em qualquer Mac, como apps baixados de site (Steam, Discord...).
#     Uma vez: xcrun notarytool store-credentials finora \
#                --apple-id voce@exemplo.com --team-id SEU_TEAM_ID
#     e depois: MF_NOTARY_PROFILE=finora scripts/build-desktop.sh
#   - Sem certificado, assina ad-hoc: roda normal no Mac que gerou; em outro Mac o .dmg
#     baixado pede "Abrir mesmo assim" em Ajustes > Privacidade e Segurança.
#   - MF_SIGN_IDENTITY força uma identidade ("-" = ad-hoc).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
install=1
[[ "${1:-}" == "--no-install" ]] && install=0

[[ "$(uname)" == "Darwin" ]] || { echo "Este script é para macOS (no Windows: build-desktop.ps1)"; exit 1; }

# 1. Frontend estático. A API fica na mesma origem que serve a página (porta = PORT em
#    backend/app/desktop.py).
echo "==> Frontend"
(
  cd "$root/frontend"
  rm -rf out-desktop  # export sempre do zero: nunca empacota sobra de um build anterior
  NEXT_OUTPUT=export NEXT_PUBLIC_API_URL="http://127.0.0.1:8765" npm run build
)

# 2. Backend + frontend num .app
echo "==> Finora.app"
(
  cd "$root/backend"
  uv sync --group desktop
  # --clean: sem ele o PyInstaller reaproveita partes antigas quando só o ícone muda
  uv run pyinstaller managerfinance.spec --noconfirm --clean
)
app="$root/backend/dist/Finora.app"
version="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")"
dmg="$root/backend/dist/Finora-$version.dmg"

# 3. Assinatura. Numa cópia fora do projeto e sem atributos estendidos: com a pasta no
#    iCloud (Mesa/Documentos), o File Provider grava FinderInfo/provenance nos arquivos e o
#    codesign recusa ("resource fork, Finder information, or similar detritus not allowed").
#    Daqui em diante $app é essa cópia assinada (vai para o .dmg e para /Applications).
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
ditto --norsrc --noextattr --noqtn "$app" "$staging/Finora.app"
app="$staging/Finora.app"
xattr -cr "$app"
identity="${MF_SIGN_IDENTITY:-}"
if [[ -z "$identity" ]]; then
  identity="$(security find-identity -v -p codesigning \
    | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -1)"
  identity="${identity:--}"
fi
echo "==> Assinando ($([[ "$identity" == "-" ]] && echo "ad-hoc" || echo "$identity"))"
if [[ "$identity" == "-" ]]; then
  codesign --force --deep --sign - "$app"
else
  codesign --force --deep --timestamp --options runtime \
    --entitlements "$root/backend/packaging/macos/entitlements.plist" \
    --sign "$identity" "$app"
fi
codesign --verify --deep --strict "$app"

# 4. .dmg com o atalho para Aplicativos (arrastar e soltar)
echo "==> $(basename "$dmg")"
ln -s /Applications "$staging/Aplicativos"
rm -f "$dmg"
hdiutil create -volname "Finora" -srcfolder "$staging" -ov -format UDZO "$dmg" >/dev/null
if [[ "$identity" != "-" ]]; then
  codesign --force --timestamp --sign "$identity" "$dmg"
  if [[ -n "${MF_NOTARY_PROFILE:-}" ]]; then
    echo "==> Notarizando (alguns minutos)"
    xcrun notarytool submit "$dmg" --keychain-profile "$MF_NOTARY_PROFILE" --wait
    xcrun stapler staple "$dmg"
  fi
fi

# 5. Configuração: o app não roda dentro da pasta do projeto e lê o .env da pasta de dados
#    (que mantém o nome de antes do Finora, ManagerFinance)
data="$HOME/Library/Application Support/ManagerFinance"
if [[ ! -f "$data/.env" && -f "$root/.env" ]]; then
  mkdir -p "$data"
  cp "$root/.env" "$data/.env"
  chmod 600 "$data/.env"
  echo "==> .env copiado para $data"
fi

# 6. Instala em /Applications, como os outros apps
if (( install )); then
  if pgrep -xq Finora; then
    echo "Feche o Finora antes de instalar a nova versão (o .dmg já está pronto)"
    exit 1
  fi
  target="/Applications"
  [[ -w "$target" ]] || target="$HOME/Applications"
  mkdir -p "$target"
  rm -rf "$target/Finora.app"
  ditto "$app" "$target/Finora.app"
  echo
  echo "Instalado em $target/Finora.app (abra pelo Launchpad ou Spotlight)"
fi
echo "Para distribuir: $dmg"
