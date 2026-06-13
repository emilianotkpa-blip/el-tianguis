param(
  [string]$PrinterName,
  [string]$DataFile
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOC_INFO_1 {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr h);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int StartDocPrinter(IntPtr h, int lv, ref DOC_INFO_1 di);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr h);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr h, byte[] buf, int n, out int w);
}
"@

$bytes    = [System.IO.File]::ReadAllBytes($DataFile)
$hPrinter = [IntPtr]::Zero

if (-not [RawPrint]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Error "OpenPrinter fallo (Win32: $err)"
    exit 1
}

$di           = New-Object RawPrint+DOC_INFO_1
$di.pDocName  = "ESC/POS"
$di.pDataType = "RAW"

$jobId = [RawPrint]::StartDocPrinter($hPrinter, 1, [ref]$di)
if ($jobId -eq 0) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [RawPrint]::ClosePrinter($hPrinter) | Out-Null
    Write-Error "StartDocPrinter fallo (Win32: $err)"
    exit 1
}

[RawPrint]::StartPagePrinter($hPrinter) | Out-Null
$written = 0
[RawPrint]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written) | Out-Null
[RawPrint]::EndPagePrinter($hPrinter)  | Out-Null
[RawPrint]::EndDocPrinter($hPrinter)   | Out-Null
[RawPrint]::ClosePrinter($hPrinter)    | Out-Null

Write-Output "OK:$written"
exit 0
