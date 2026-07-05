$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $Command $($Arguments -join ' ')"
  }
}

Set-Location (Resolve-Path "$PSScriptRoot\..")

Write-Host "Updating Signage version..."
$version = (& node "tools/bump-version.js").Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Command failed: node tools/bump-version.js"
}

Write-Host ""
Write-Host "Git status:"
$status = (& git status --short)
if ($LASTEXITCODE -ne 0) {
  throw "Command failed: git status --short"
}

if (-not $status) {
  Write-Host "No changes to release."
  exit 0
}

$status | ForEach-Object { Write-Host $_ }

Write-Host ""
$message = Read-Host "Commit Message"
if ([string]::IsNullOrWhiteSpace($message)) {
  throw "Commit message is required."
}

Invoke-Checked git add .
Invoke-Checked git commit -m $message
$commit = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Command failed: git rev-parse --short HEAD"
}

Invoke-Checked git push

Write-Host ""
Write-Host "Release completed"
Write-Host "Version : $version"
Write-Host "Commit : $commit"
