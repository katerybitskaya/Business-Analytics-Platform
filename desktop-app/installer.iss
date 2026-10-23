#define AppName "Business Analytics Platform"
#define AppVersion "1.0.0"
#define AppPublisher "Katsiaryna Rybitskaya"
#define AppExeName "BusinessAnalyticsPlatform.exe"
#define AppDataFolder "BusinessAnalyticsPlatform"

[Setup]
AppId={{FE29FC2D-6023-4A91-8EF4-D5F0B5A5C470}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist
OutputBaseFilename=BusinessAnalyticsPlatformSetup
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "polish";  MessagesFile: "compiler:Languages\Polish.isl"
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"

[CustomMessages]
english.DeleteDataQuestion=Also delete your data (database, settings, avatars)?%n%n%1%n%nThis cannot be undone.
polish.DeleteDataQuestion=Usunąć również Twoje dane (baza danych, ustawienia, awatary)?%n%n%1%n%nTej operacji nie można cofnąć.
russian.DeleteDataQuestion=Удалить также ваши данные (база данных, настройки, аватары)?%n%n%1%n%nЭто действие нельзя отменить.

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{localappdata}\{#AppDataFolder}');
    if DirExists(DataDir) then
      if SuppressibleMsgBox(FmtMessage(CustomMessage('DeleteDataQuestion'), [DataDir]), mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES then
        DelTree(DataDir, True, True, True);
  end;
end;
