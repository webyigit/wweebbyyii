<#
    네이버 블로그 자동발행 - Windows 작업 스케줄러 등록 스크립트

    이 프로젝트는 본인 PC의 로그인된 Chrome을 직접 조작하므로, 발행 예약은
    반드시 이 PC의 작업 스케줄러가 맡아야 한다 (클라우드에서는 불가능).

    사용법 (관리자 권한 필요 없음 - 현재 사용자 작업으로 등록됩니다):
        powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1
        powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1 -Time 21:30

    등록 후 확인 / 시험 / 삭제는 스크립트가 마지막에 안내해준다.
#>
param(
    # 매일 실행할 시각 (24시간제, 로컬 시간).
    # 기본값은 Claude 루틴이 오전 8시에 초안을 커밋한 뒤로 잡아둔 것.
    [string]$Time = "08:40",

    [string]$TaskName = "NaverBlogAutoPost"
)

$ErrorActionPreference = "Stop"

$root   = $PSScriptRoot
$runner = Join-Path $root "run_auto_post.bat"
$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $runner)) {
    throw "run_auto_post.bat 을 찾을 수 없습니다: $runner"
}
if (-not (Test-Path $python)) {
    Write-Warning "가상환경 파이썬이 아직 없습니다: $python"
    Write-Warning "  먼저 .venv 를 만들고 pip install -r requirements.txt 를 실행하세요."
}

# 무인 실행이 실제로 발행까지 가려면 headless=true / dry_run=false 조합이어야 한다.
$configPath = Join-Path $root "config.json"
if (Test-Path $configPath) {
    $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    if (-not $cfg.headless) {
        Write-Warning "config.json 의 headless 가 false 입니다 - 예약 실행 때마다 크롬 창이 뜹니다."
    }
    if ($cfg.dry_run) {
        Write-Warning "config.json 의 dry_run 이 true 입니다 - 제목/본문 입력까지만 하고 발행하지 않습니다."
        Write-Warning "  익숙해진 뒤 dry_run 을 false 로 바꾸면 발행까지 자동 진행됩니다."
    }
} else {
    Write-Warning "config.json 이 없습니다 - config.example.json 을 복사해서 먼저 만들어주세요."
}

$chromeProfile = Join-Path $root "chrome_profile"
if (-not (Test-Path $chromeProfile)) {
    Write-Warning "로그인 세션(chrome_profile)이 없습니다 - 예약 실행은 바로 실패합니다."
    Write-Warning "  먼저 'python auto_post.py --inspect' 로 네이버에 한 번 로그인해두세요."
}

$action  = New-ScheduledTaskAction -Execute $runner -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -MultipleInstances IgnoreNew

# LogonType Interactive: 로그인된 세션에서만 실행된다.
# 네이버 로그인 쿠키가 담긴 본인 크롬 프로필을 써야 하므로 이 방식이 맞다.
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "네이버 블로그 초안을 매일 정해진 시각에 자동 발행 (run_auto_post.bat)" `
    -Force | Out-Null

$logPath = Join-Path $root "logs\auto_post.log"

Write-Host ""
Write-Host "[완료] '$TaskName' 작업을 매일 $Time 에 실행하도록 등록했습니다." -ForegroundColor Green
Write-Host ""
Write-Host "  실행 대상 : $runner"
Write-Host "  로그 파일 : $logPath"
Write-Host ""
Write-Host "  등록 확인 : Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "  즉시 시험 : Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  실행 이력 : Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host "  삭제      : Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
Write-Host ""
Write-Host "  주의: 이 작업은 PC가 켜져 있고 로그인된 상태에서만 실행됩니다." -ForegroundColor Yellow
Write-Host "        네이버 로그인 세션이 만료되면 실패하므로, 로그가 계속 실패하면" -ForegroundColor Yellow
Write-Host "        headless 를 잠깐 false 로 두고 수동으로 한 번 로그인해주세요." -ForegroundColor Yellow
