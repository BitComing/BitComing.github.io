# gen-manifest.ps1 — 扫描 posts/ 目录下的 .md 文件，自动生成 manifest.json
#
# 用法：
#   pwsh -File .\gen-manifest.ps1

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PostsDir = Join-Path $ScriptDir 'posts'
$Manifest = Join-Path $PostsDir 'manifest.json'

if (-not (Test-Path $PostsDir)) {
    New-Item -ItemType Directory -Path $PostsDir | Out-Null
}

$files = @()
if (Test-Path $PostsDir) {
    $files = Get-ChildItem -Path $PostsDir -Filter '*.md' -File |
        Sort-Object Name |
        ForEach-Object { $_.Name }
}

$json = $files | ConvertTo-Json -Compress
Set-Content -Path $Manifest -Value $json -Encoding utf8

Write-Host "[gen-manifest] 已生成 manifest.json ($($files.Count) 篇文章)"
