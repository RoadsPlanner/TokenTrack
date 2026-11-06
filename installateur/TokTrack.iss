; Installateur Tok&Track (Inno Setup 6).
; Ne pas compiler à la main : double-cliquer sur construire.cmd,
; qui crée TokTrack.exe (dans temp) puis cet installateur.
; Installation sans droits administrateur, dans le profil de l'utilisateur.

#define Nom "Tok&Track"
; La version vient de code\version.json (passée par construire.js).
#ifndef Version
  #define Version "0.0.0"
#endif

[Setup]
AppId={{6E3C1B2A-7F4D-4C8E-9A51-3D2B8E7F0C14}
AppName={#Nom}
AppVersion={#Version}
AppPublisher=SAE BUT3
DefaultDirName={localappdata}\Programs\TokTrack
DefaultGroupName={#Nom}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=Installer-TokTrack
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\TokTrack.exe

[Languages]
Name: "fr"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "bureau"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"

[Files]
Source: "temp\TokTrack.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#Nom}"; Filename: "{app}\TokTrack.exe"; Comment: "Tableau de bord des tokens IA"
Name: "{group}\Dossier des données {#Nom}"; Filename: "{localappdata}\Tok&Track"
Name: "{group}\Désinstaller {#Nom}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#Nom}"; Filename: "{app}\TokTrack.exe"; Tasks: bureau

[Run]
Filename: "{app}\TokTrack.exe"; Description: "Ouvrir {#Nom} maintenant"; Flags: nowait postinstall skipifsilent
; Après une mise à jour automatique (installateur lancé par l'appli avec /MAJ=1) : rouvre l'appli.
Filename: "{app}\TokTrack.exe"; Flags: nowait; Check: EstMiseAJour

[Code]
function EstMiseAJour: Boolean;
begin
  Result := ExpandConstant('{param:MAJ|0}') = '1';
end;
