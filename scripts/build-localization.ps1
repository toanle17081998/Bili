$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:USERPROFILE '.cargo\bin\rustc.exe'
if (!(Test-Path -LiteralPath $compiler)) { $compiler = 'rustc' }
& $compiler --edition=2024 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 -C strip=symbols -C panic=abort (Join-Path $root 'rust\crates\localization\src\lib.rs') -o (Join-Path $root 'rust\crates\localization\timing.wasm')
if ($LASTEXITCODE -ne 0) { throw 'Could not build localization timing WASM. Install Rust and the wasm32-unknown-unknown target.' }
