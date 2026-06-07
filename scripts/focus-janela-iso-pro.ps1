# Traz a janela I.S.O PRO para a frente (Windows).
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$proc = Get-Process -Name 'electron' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like '*I.S.O PRO*' -or $_.MainWindowTitle -like '*ISO PRO*' } |
  Select-Object -First 1

if (-not $proc) {
  Write-Host 'Nenhuma janela I.S.O PRO encontrada. Execute: npm run dev:clean' -ForegroundColor Red
  exit 1
}

[void][Win32Focus]::ShowWindow($proc.MainWindowHandle, 9)
[void][Win32Focus]::SetForegroundWindow($proc.MainWindowHandle)
Write-Host "Janela em foco: $($proc.MainWindowTitle) (PID $($proc.Id))" -ForegroundColor Green
