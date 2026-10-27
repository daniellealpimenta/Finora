# PyInstaller: gera dist/Finora/Finora.exe (Windows) ou
# dist/Finora.app (macOS). Rode via scripts/build-desktop.ps1 ou scripts/build-desktop.sh,
# que antes geram o frontend estático em frontend/out-desktop.
import sys
import tomllib
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

root = Path(SPECPATH)
frontend = root.parent / "frontend" / "out-desktop"
if not (frontend / "index.html").is_file():
    raise SystemExit("frontend/out-desktop não existe: rode scripts/build-desktop.ps1 ou .sh")

mac = sys.platform == "darwin"
version = tomllib.loads((root / "pyproject.toml").read_text())["project"]["version"]

a = Analysis(
    [str(root / "app" / "desktop.py")],
    pathex=[str(root)],
    datas=[
        (str(root / "alembic.ini"), "."),
        (str(root / "migrations"), "migrations"),
        (str(frontend), "frontend"),
        # Mascotes em PNG dos avisos por e-mail (app/services/notify/render.py)
        (str(root / "app" / "assets"), "app/assets"),
    ],
    # Importados por string (uvicorn, migrações) e não achados pela análise estática
    hiddenimports=collect_submodules("uvicorn") + collect_submodules("app") + ["argon2"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Finora",
    console=False,
    icon=str(
        root / "packaging" / "macos" / "Finora.icns"
        if mac
        else root.parent / "frontend" / "src" / "app" / "favicon.ico"
    ),
    # A assinatura é feita depois, pelo build-desktop.sh (ad-hoc ou Developer ID)
    codesign_identity=None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Finora")

if mac:
    app = BUNDLE(
        coll,
        name="Finora.app",
        icon=str(root / "packaging" / "macos" / "Finora.icns"),
        bundle_identifier="com.danielleal.finora",
        version=version,
        info_plist={
            "CFBundleDisplayName": "Finora",
            "CFBundleShortVersionString": version,
            "CFBundleVersion": version,
            "LSApplicationCategoryType": "public.app-category.finance",
            "LSMinimumSystemVersion": "12.0",
            "NSHighResolutionCapable": True,
            # Segue o tema claro/escuro do sistema
            "NSRequiresAquaSystemAppearance": False,
            # A janela carrega http://127.0.0.1 (a API no próprio app); só isso fica liberado
            "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True},
        },
    )
