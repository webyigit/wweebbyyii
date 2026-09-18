<#
    네이버 블로그 자동발행 - Windows 작업 스케줄러 등록 스크립트

    이 프로젝트는 본인 PC의 로그인된 Chrome을 직접 조작하므로, 발행 예약은
    반드시 이 PC의 작업 스케줄러가 맡아야 한다 (클라우드에서는 불가능).

    기본값은 08:00 부터 1시간 30분 간격으로 6번 = 08:00, 09:30, 11:00,
    12:30, 14:00, 15:30 에 각각 초안 1개씩 발행한다.

    사용법 (관리자 권한 필요 없음 - 현재 사용자 작업으로 등록됩니다):
        powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1

        # 하루 3개, 2시간 간격, 오전 10시 시작으로 줄이기
        powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1 `
            -Time 10:00 -IntervalMinutes 120 -Count 3

    등록 후 확인 / 시험 / 삭제는 스크립트가 마지막에 안내해준다.
#>
param(
    # 첫 번째 발행 시각 (24시간제, 로컬 시간).
    # Claude 루틴이 06:30 에 초안을 만들어 올린 뒤로 잡아둔 것.
    [string]$Time = "08:00",

    # 발행 간격 (분).
    [int]$IntervalMinutes = 90,

    # 하루 발행 횟수 (첫 회 포함).
    [int]$Count = 6,

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

if ($Count -lt 1) { throw "-Count 는 1 이상이어야 합니다." }
if ($IntervalMinutes -lt 1) { throw "-IntervalMinutes 는 1 이상이어야 합니다." }

# 발행 횟수만큼 초안이 있어야 한다. 초안은 클라우드 루틴이 routine.json 의
# posts_per_day 만큼 만들어주므로, 두 값이 어긋나면 미리 알려준다.
$routinePath = Join-Path $root "routine.json"
if (Test-Path $routinePath) {
    $routine = Get-Content $routinePath -Raw | ConvertFrom-Json
    if ($routine.posts_per_day -ne $Count) {
        Write-Warning "routine.json 의 posts_per_day($($routine.posts_per_day)) 와 -Count($Count) 가 다릅니다."
        Write-Warning "  초안보다 발행 횟수가 많으면 남는 실행은 '대상 없음' 으로 그냥 종료됩니다."
    }

    # 하루에 대분류당 1개씩 뽑으므로, 대분류 개수가 발행 횟수보다 적으면 모자란다.
    $groups = @($routine.category_groups.PSObject.Properties)
    if ($groups.Count -lt $Count) {
        Write-Warning "routine.json 의 대분류가 $($groups.Count)개뿐입니다 (발행 $Count 회)."
        Write-Warning "  대분류당 하루 1개씩 뽑기 때문에 초안이 $($groups.Count)개만 만들어집니다."
    }
    $emptyGroups = $groups | Where-Object { @($_.Value).Count -eq 0 } | ForEach-Object { $_.Name }
    if ($emptyGroups) {
        Write-Warning "중분류가 비어 있는 대분류가 있습니다: $($emptyGroups -join ', ')"
    }
}

$action = New-ScheduledTaskAction -Execute $runner -WorkingDirectory $root

# 매일 $Time 에 시작해서 $IntervalMinutes 간격으로 총 $Count 번 실행한다.
# New-ScheduledTaskTrigger 는 -Daily 와 -RepetitionInterval 을 같이 받지 않으므로,
# -Once 트리거에서 Repetition 객체만 떼어내 -Daily 트리거에 붙인다 (표준 우회법).
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
if ($Count -gt 1) {
    $span = New-TimeSpan -Minutes $IntervalMinutes
    $totalSpan = New-TimeSpan -Minutes ($IntervalMinutes * ($Count - 1))
    $trigger.Repetition = (
        New-ScheduledTaskTrigger -Once -At $Time `
            -RepetitionInterval $span -RepetitionDuration $totalSpan
    ).Repetition
}

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
    -Description "네이버 블로그 초안을 매일 $Time 부터 $IntervalMinutes 분 간격으로 $Count 번 자동 발행 (run_auto_post.bat)" `
    -Force | Out-Null

$logPath = Join-Path $root "logs\auto_post.log"

# 실제 발행 시각을 계산해서 보여준다 (예약이 의도대로 잡혔는지 눈으로 확인용).
$start = Get-Date $Time
$slots = 0..($Count - 1) | ForEach-Object { $start.AddMinutes($IntervalMinutes * $_).ToString("HH:mm") }

Write-Host ""
Write-Host "[완료] '$TaskName' 작업을 등록했습니다." -ForegroundColor Green
Write-Host ""
Write-Host "  발행 시각 : $($slots -join ', ')  (매일 $Count 회, $IntervalMinutes 분 간격)"
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
