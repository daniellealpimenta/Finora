; Instalador para Windows (Inno Setup 6). Antes, gere o programa:
;   .\scripts\build-desktop.ps1 -NoInstall
;   iscc /DAppVersion=0.3.0 scripts\installer.iss
; Saída: dist\Finora-Setup-<versão>.exe. O GitHub Actions faz isso a cada tag v*.

#ifndef AppVersion
  #define AppVersion "0.0.0-dev"
#endif

[Setup]
; Não mude o AppId: é por ele que o Windows reconhece uma atualização do mesmo app
AppId={{6F1C2E7A-4B8D-4E3F-9A21-5C7D8E9F0A1B}
AppName=Finora
AppVersion={#AppVersion}
AppPublisher=Finora
AppPublisherURL=https://github.com/daniellealpimenta/ManagerFinance
DefaultDirName={localappdata}\Programs\Finora
DefaultGroupName=Finora
DisableProgramGroupPage=yes
; Instala só para o usuário atual, sem pedir senha de administrador
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=Finora-Setup-{#AppVersion}
SetupIconFile=..\frontend\src\app\favicon.ico
UninstallDisplayIcon={app}\Finora.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Fecha o app aberto antes de atualizar
CloseApplications=yes

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; Flags: unchecked

[Files]
Source: "..\backend\dist\Finora\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Finora"; Filename: "{app}\Finora.exe"
Name: "{userdesktop}\Finora"; Filename: "{app}\Finora.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Finora.exe"; Description: "Abrir o Finora"; Flags: nowait postinstall skipifsilent

[Code]
// Os dados (banco, chaves, logs) ficam fora da pasta do programa. Desinstalar mantém tudo,
// a menos que a pessoa peça para apagar.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{localappdata}\ManagerFinance');
    if DirExists(DataDir) and not UninstallSilent then
      if MsgBox('Apagar também os seus dados (transações, contas e chaves da Pluggy)?' + #13#10 + #13#10 +
                'Escolha "Não" se pretende instalar de novo depois.' + #13#10 + DataDir,
                mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(DataDir, True, True, True);
  end;
end;
