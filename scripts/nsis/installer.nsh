; Recria atalhos com ícone explícito em resources\icon.ico.
; O CreateShortCut por defeito usa "$appExe" como ícone — no Electron o índice 0 do .exe
; muitas vezes continua a ser o ícone genérico; o .ico em extraResources é fiável no Explorador.

!macro customInstall
  ${If} ${FileExists} "$INSTDIR\resources\icon.ico"
    !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
      ${ifNot} ${isNoDesktopShortcut}
        ${If} ${FileExists} "$newDesktopLink"
          Delete "$newDesktopLink"
          CreateShortCut "$newDesktopLink" "$appExe" "" "$INSTDIR\resources\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
          WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ${EndIf}
      ${EndIf}
    !endif

    !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
      ${If} ${FileExists} "$newStartMenuLink"
        Delete "$newStartMenuLink"
        CreateShortCut "$newStartMenuLink" "$appExe" "" "$INSTDIR\resources\icon.ico" 0 "" "" "${APP_DESCRIPTION}"
        WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
      ${EndIf}
    !endif

    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}
!macroend
