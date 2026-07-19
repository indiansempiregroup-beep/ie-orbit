Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Resolve-Path (Join-Path $scriptDir '..')
Set-Location $rootDir

docker compose down -v --remove-orphans
. (Join-Path $scriptDir 'dev-up.ps1')
