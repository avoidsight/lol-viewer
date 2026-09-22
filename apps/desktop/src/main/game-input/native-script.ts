// Fixed source only; player text travels over stdin and is never interpolated as code.
export const nativeScript = String.raw`
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
public static class RadarInput {
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
 [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION data; }
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
 static IntPtr window;
 static uint processId;
 static bool Held(int key) { return (GetAsyncKeyState(key) & 0x8000) != 0; }
 static bool Modifiers() { return Held(0x10)||Held(0x11)||Held(0x12)||Held(0x5b)||Held(0x5c)||Held(0x0d)||Held(0x56); }
 static bool Focused() {
   uint id; var current = GetForegroundWindow();
   GetWindowThreadProcessId(current, out id);
   return current == window && id == processId && !Held(0x1b);
 }
 public static bool Capture() {
   window = GetForegroundWindow(); GetWindowThreadProcessId(window, out processId);
   if (window == IntPtr.Zero || processId == 0) return false;
   using (var p = Process.GetProcessById((int)processId)) {
     return String.Equals(System.IO.Path.GetFileName(p.MainModule.FileName), "League of Legends.exe", StringComparison.OrdinalIgnoreCase);
   }
 }
 public static void Type(string text) {
   if (String.IsNullOrWhiteSpace(text) || text.Length > 180 || text.TrimStart().StartsWith("/")) throw new Exception();
   foreach (char c in text) if (Char.IsControl(c) || Char.GetUnicodeCategory(c) == System.Globalization.UnicodeCategory.Format || c == '\u2028' || c == '\u2029') throw new Exception();
   var clock = Stopwatch.StartNew();
   while (Modifiers()) { if (!Focused() || clock.ElapsedMilliseconds > 1000) throw new Exception(); Thread.Sleep(10); }
   for (int i=0; i<text.Length; i++) {
     if (!Focused() || Modifiers() || clock.ElapsedMilliseconds > 4000) throw new Exception();
     int units = Char.IsHighSurrogate(text[i]) && i+1<text.Length && Char.IsLowSurrogate(text[i+1]) ? 2 : 1;
     if (Char.IsSurrogate(text[i]) && units == 1) throw new Exception();
     var inputs = new INPUT[units*2];
     for (int j=0; j<units; j++) {
       inputs[j*2].type=1; inputs[j*2].data.keyboard.scan=text[i+j]; inputs[j*2].data.keyboard.flags=4;
       inputs[j*2+1]=inputs[j*2]; inputs[j*2+1].data.keyboard.flags=4|2;
     }
     if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length) throw new Exception();
     i+=units-1; Thread.Sleep(5);
   }
 }
}
'@
if (-not [RadarInput]::Capture()) { exit 2 }
[Console]::Out.WriteLine('READY')
$line = [Console]::ReadLine()
if ($null -eq $line -or $line.Length -gt 1024) { exit 3 }
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line))
[RadarInput]::Type($text)
exit 0
} catch { exit 4 }
`;
