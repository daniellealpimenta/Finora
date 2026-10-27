# PyInstaller: gera dist/ManagerFinance/ManagerFinance.exe. Rode via scripts/build-desktop.ps1,
# que antes gera o frontend estático em frontend/out.
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

root = Path(SPECPATH)
frontend = root.parent / "frontend" / "out"
if not (frontend / "index.html").is_file():
    raise SystemExit("frontend/out não existe: rode scripts/build-desktop.ps1")

a = Analysis(
    [str(root / "app" / "desktop.py")],
    pathex=[str(root)],
    datas=[
        (str(root / "alembic.ini"), "."),
        (str(root / "migrations"), "migrations"),
        (str(frontend), "frontend"),
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
    name="ManagerFinance",
    console=False,
    icon=str(root.parent / "frontend" / "src" / "app" / "favicon.ico"),
)
coll = COLLECT(exe, a.binaries, a.datas, name="ManagerFinance")
