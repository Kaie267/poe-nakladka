'use strict';
// Pomocnik Windows: wysyła klawisze do gry i sprawdza aktywne okno.
// Działa przez stały proces PowerShell z małą klasą C# (user32.dll), więc nie potrzeba
// natywnych modułów Node. Każda akcja to jedno naciśnięcie klawisza przez gracza — zgodnie z zasadami GGG.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class K {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string c, string t);
  public static void Down(byte vk){ keybd_event(vk,0,0,UIntPtr.Zero); }
  public static void Up(byte vk){ keybd_event(vk,0,2,UIntPtr.Zero); }
  public static void Tap(byte vk){ Down(vk); Up(vk); }
  public static string Fg(){ var h=GetForegroundWindow(); var a=new StringBuilder(256); var b=new StringBuilder(256); GetWindowText(h,a,256); GetClassName(h,b,256); return b.ToString()+"|"+a.ToString(); }
  public static IntPtr Poe(){ var h=FindWindow("POEWindowClass", null); if (h==IntPtr.Zero) h=FindWindow(null,"Path of Exile"); return h; }
  public static bool FocusPoe(){ var h=Poe(); if (h==IntPtr.Zero) return false; Tap(0x12); SetForegroundWindow(h); return true; }
}
"@
[Console]::Out.WriteLine("ready"); [Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split(' ', 3)
  $id = $parts[0]; $cmd = $parts[1]; $arg = ''
  if ($parts.Length -gt 2) { $arg = $parts[2] }
  $out = 'ok'
  switch ($cmd) {
    'fg' { $out = [K]::Fg() }
    'copy' {
      [K]::Up(0x44)
      [K]::Down(0x11)
      if ($arg -eq '1') { [K]::Down(0x12) }
      [K]::Tap(0x43)
      if ($arg -eq '1') { [K]::Up(0x12) }
      [K]::Up(0x11)
    }
    'chat' {
      # schowek ustawia Electron; tu: fokus gry, Enter, Ctrl+V, Enter
      if (-not [K]::FocusPoe()) { $out = 'nopoe' } else {
        Start-Sleep -Milliseconds 60
        [K]::Tap(0x0D); Start-Sleep -Milliseconds 40
        [K]::Down(0x11); [K]::Tap(0x41); [K]::Tap(0x56); [K]::Up(0x11); Start-Sleep -Milliseconds 40
        [K]::Tap(0x0D)
      }
    }
    'focus' { if (-not [K]::FocusPoe()) { $out = 'nopoe' } }
    'procpath' {
      $p = Get-Process | Where-Object { $_.ProcessName -like 'PathOfExile*' } | Select-Object -First 1
      if ($p) { $out = $p.Path } else { $out = '' }
    }
  }
  [Console]::Out.WriteLine("$id $out"); [Console]::Out.Flush()
}
`;

class Keys {
  constructor(dir) {
    this.ok = process.platform === 'win32';
    this.pending = new Map();
    this.seq = 0;
    if (!this.ok) return;
    const file = path.join(dir, 'pomocnik.ps1');
    fs.writeFileSync(file, PS, 'utf8');
    this.proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', file], { windowsHide: true });
    let buf = '';
    this.proc.stdout.on('data', d => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
        const sp = line.indexOf(' ');
        const id = sp > 0 ? line.slice(0, sp) : line;
        const p = this.pending.get(id);
        if (p) { this.pending.delete(id); p(sp > 0 ? line.slice(sp + 1) : ''); }
      }
    });
    this.proc.on('exit', () => { this.ok = false; });
  }
  send(cmd, arg = '', timeout = 3000) {
    if (!this.ok) return Promise.resolve('');
    const id = String(++this.seq);
    return new Promise(resolve => {
      const t = setTimeout(() => { this.pending.delete(id); resolve(''); }, timeout);
      this.pending.set(id, v => { clearTimeout(t); resolve(v); });
      this.proc.stdin.write(`${id} ${cmd} ${arg}\n`);
    });
  }
  async foreground() {
    const r = await this.send('fg', '', 1500);
    const [cls, ...title] = r.split('|');
    return { cls, title: title.join('|') };
  }
  copyItem(advanced) { return this.send('copy', advanced ? '1' : '0'); }
  chat() { return this.send('chat'); }
  focusGame() { return this.send('focus'); }
  procPath() { return this.send('procpath', '', 8000); }
  stop() { try { this.proc && this.proc.kill(); } catch { /* */ } }
}

module.exports = { Keys };
