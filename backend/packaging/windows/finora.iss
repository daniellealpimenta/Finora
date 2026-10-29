; Instalador do Windows (Inno Setup 6): backend\dist\Finora-Windows-Setup.exe
; Gerado pelo scripts\build-desktop.ps1 quando o Inno Setup está instalado:
;   ISCC.exe /DAppVersion=0.1.0 packaging\windows\finora.iss
; Instala para o usuário (sem pedir administrador) no mesmo lugar do build-desktop.ps1, com
; atalho no Menu Iniciar e desinstalador. Os dados (banco e .env) ficam em
; %LOCALAPPDATA%\ManagerFinance e não são apagados ao desinstalar.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
; Fixo: é o que o Windows usa para reconhecer uma atualização do mesmo app
AppId={{4172E929-2CF9-45B4-92AB-1116E8D5FFED}
AppName=Finora
AppVersion={#AppVersion}
AppPublisher=Daniel Leal Pimenta
DefaultDirName={localappdata}\Programs\Finora
DefaultGroupName=Finora
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=Finora-Windows-Setup
SetupIconFile=..\..\..\frontend\src\app\favicon.ico
UninstallDisplayIcon={app}\Finora.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Fecha o Finora aberto antes de atualizar
CloseApplications=yes

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Área de Trabalho"; Flags: unchecked

[Files]
Source: "..\..\dist\Finora\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Finora"; Filename: "{app}\Finora.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Finora"; Filename: "{app}\Finora.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Finora.exe"; Description: "Abrir o Finora"; Flags: nowait postinstall skipifsilent
