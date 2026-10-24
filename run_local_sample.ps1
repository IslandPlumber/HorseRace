param([switch]$Build, [switch]$Preview)
$ErrorActionPreference = 'Stop'
$sampleRoot = $PSScriptRoot
$blenderPath = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
Set-Location -LiteralPath $sampleRoot
if (!(Test-Path -LiteralPath $blenderPath)) { throw "Blender not found at $blenderPath" }
if ($Build) {
    & $blenderPath --background --factory-startup --python-exit-code 1 --python build_sample.py *> build.log
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. See build.log.' }
}
if (!(Test-Path -LiteralPath 'streakchat_two_horse.blend')) { throw 'Run with -Build first.' }
$renderMode = if ($Preview) { 'preview' } else { 'animation' }
$renderArguments = @('--background', 'streakchat_two_horse.blend', '--python-exit-code', '1', '--python', 'render_sample.py', '--', $renderMode, '--720', '--samples', '64')
$renderTimer = [Diagnostics.Stopwatch]::StartNew()
$renderProcess = Start-Process -FilePath $blenderPath -ArgumentList $renderArguments -WorkingDirectory $sampleRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$sampleRoot\render_$renderMode.log" -RedirectStandardError "$sampleRoot\render_$renderMode.err.log"
$renderPeakWorking = 0L
$renderPeakPrivate = 0L
while (!$renderProcess.WaitForExit(1000)) {
    $renderProcess.Refresh()
    $renderPeakWorking = [math]::Max($renderPeakWorking, $renderProcess.PeakWorkingSet64)
    $renderPeakPrivate = [math]::Max($renderPeakPrivate, $renderProcess.PrivateMemorySize64)
}
$renderTimer.Stop()
if ($renderProcess.ExitCode -ne 0) { throw "Render failed. See render_$renderMode.err.log." }
$renderMetrics = [ordered]@{
    mode = $renderMode
    process_wall_seconds = [math]::Round($renderTimer.Elapsed.TotalSeconds, 3)
    peak_working_set_mb = [math]::Round($renderPeakWorking / 1MB, 1)
    peak_private_commit_mb = [math]::Round($renderPeakPrivate / 1MB, 1)
    memory_sampling_interval_seconds = 1
}
$renderMetrics | ConvertTo-Json | Set-Content -LiteralPath "$sampleRoot\renders\720p\process_$renderMode.json"
if (!$Preview) {
    & $blenderPath --background --factory-startup --python-exit-code 1 --python encode_clip.py *> encode.log
    if ($LASTEXITCODE -ne 0) { throw 'Encoding failed. See encode.log.' }
    & $blenderPath --background streakchat_two_horse.blend --python-exit-code 1 --python export_assets.py *> export_assets.log
    if ($LASTEXITCODE -ne 0) { throw 'Asset export failed. See export_assets.log.' }
}
$renderMetrics | ConvertTo-Json
