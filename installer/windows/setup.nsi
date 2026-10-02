Unicode true
!include "MUI2.nsh"
!ifndef APP_URL
  !define APP_URL "https://kazunyon.github.io/kotoba_memo/"
!endif
Name "ことばメモ"
OutFile "kotoba-memo-setup.exe"
InstallDir "$LOCALAPPDATA\KotobaMemoGoogle"
RequestExecutionLevel user
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION "LaunchApp"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Japanese"
Function LaunchApp
  ExecShell "open" "${APP_URL}"
FunctionEnd
Section "ことばメモ"
  SetOutPath "$INSTDIR"
  FileOpen $0 "$INSTDIR\ことばメモ.url" w
  FileWrite $0 "[InternetShortcut]$\r$\nURL=${APP_URL}$\r$\n"
  FileClose $0
  CreateShortcut "$DESKTOP\ことばメモ.lnk" "$INSTDIR\ことばメモ.url"
  CreateDirectory "$SMPROGRAMS\ことばメモ"
  CreateShortcut "$SMPROGRAMS\ことばメモ\ことばメモ.lnk" "$INSTDIR\ことばメモ.url"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KotobaMemoGoogle" "DisplayName" "ことばメモ（Google Drive版）"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KotobaMemoGoogle" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KotobaMemoGoogle" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KotobaMemoGoogle" "NoRepair" 1
SectionEnd
Section "Uninstall"
  Delete "$DESKTOP\ことばメモ.lnk"
  Delete "$SMPROGRAMS\ことばメモ\ことばメモ.lnk"
  RMDir "$SMPROGRAMS\ことばメモ"
  Delete "$INSTDIR\ことばメモ.url"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\KotobaMemoGoogle"
SectionEnd
