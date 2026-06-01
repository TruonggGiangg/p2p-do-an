<#
.SYNOPSIS
    P2P Lending - Full Stack Startup Script
    Khoi dong toan bo he thong tu A-Z

.PARAMETER NoDocker
    Bo qua khoi dong Docker services

.PARAMETER NoFrontend
    Bo qua khoi dong Frontend (Admin Web, Mobile)

.PARAMETER NoMobile
    Bo qua khoi dong Mobile App

.PARAMETER NoBlockchain
    Bo qua huong dan Blockchain

.PARAMETER Quick
    Bo qua Docker (gia su da chay san)

.EXAMPLE
    .\start-all.ps1
    .\start-all.ps1 -Quick
    .\start-all.ps1 -NoFrontend
    .\start-all.ps1 -NoDocker -NoMobile
#>

param(
    [switch]$NoDocker,
    [switch]$NoFrontend,
    [switch]$NoMobile,
    [switch]$NoBlockchain,
    [switch]$Quick
)

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$LOG_FILE = "$ROOT\startup-log.txt"
$START_TIME = Get-Date

# Remove old log
if (Test-Path $LOG_FILE) { Remove-Item $LOG_FILE -Force }

function Log {
    param([string]$Msg, [string]$Color = "White")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $line = "[$timestamp] $Msg"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8
}

function Step {
    param([string]$Msg)
    Write-Host ""
    Log "================================================================" Magenta
    Log "  $Msg" Magenta
    Log "================================================================" Magenta
    Write-Host ""
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSeconds = 60, [string]$ServiceName = "Service")
    $start = Get-Date
    while ((Get-Date) -lt $start.AddSeconds($TimeoutSeconds)) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $result = $tcp.ConnectAsync("127.0.0.1", $Port).Wait(2000)
            if ($tcp.Connected) {
                $tcp.Close()
                Log "  [OK] $ServiceName ready on port $Port" Green
                return $true
            }
            $tcp.Close()
        } catch {}
        Start-Sleep -Seconds 3
    }
    Log "  [WARN] $ServiceName NOT ready after ${TimeoutSeconds}s on port $Port" Yellow
    return $false
}

function Start-DockerCompose {
    param([string]$Path, [string]$Name, [string]$File = "docker-compose.yml")
    $composeFile = Join-Path $Path $File
    if (-not (Test-Path $composeFile)) {
        Log "  [ERR] Compose file not found: $composeFile" Red
        return $false
    }
    Log "  [DOCKER] Starting $Name ..." Cyan
    Push-Location $Path
    $fileArg = if ($File -ne "docker-compose.yml") { @("-f", $File, "up", "-d") } else { @("up", "-d") }
    & docker-compose @fileArg 2>&1 | Out-Null
    Pop-Location
    Log "  [OK] $Name started" Green
    return $true
}

function Start-InNewWindow {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    $cmd = "cd /d `"$WorkDir`" && $Command"
    Start-Process cmd -ArgumentList "/k title $Title && $cmd"
    Log "  [OK] $Title launched in new window" Green
}

# =================================================================
# MAIN
# =================================================================

Clear-Host
Write-Host ""
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host "    P2P LENDING - FULL STACK STARTUP SCRIPT" -ForegroundColor Cyan
Write-Host "    $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "    Root: $ROOT" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------
# PHASE 0: Prerequisites check
# -----------------------------------------------------------------
Step "[Phase 0] Kiem tra moi truong"

$prereqOk = $true

$dockerVer = docker --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Log "  [OK] Docker: $dockerVer" Green
} else {
    Log "  [ERR] Docker khong tim thay! Hay cai Docker Desktop." Red
    $prereqOk = $false
}

$nodeVer = node --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Log "  [OK] Node.js: $nodeVer" Green
} else {
    Log "  [ERR] Node.js khong tim thay!" Red
    $prereqOk = $false
}

$npmVer = npm --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Log "  [OK] npm: v$npmVer" Green
} else {
    Log "  [ERR] npm khong tim thay!" Red
    $prereqOk = $false
}

if (-not $prereqOk) {
    Log "[ABORT] Thieu prerequisites. Dung lai." Red
    exit 1
}

# -----------------------------------------------------------------
# PHASE 1: Docker Services
# -----------------------------------------------------------------
if (-not $Quick -and -not $NoDocker) {
    Step "[Phase 1] Khoi dong Docker Services"

    # 1.1 Fineract + MariaDB + Keycloak
    $fineractPath = "$ROOT\fineract_do_an\fineract-dev"
    if (Test-Path $fineractPath) {
        Start-DockerCompose -Path $fineractPath -Name "Fineract + MariaDB + Keycloak"
        Log "  [WAIT] Cho Keycloak (port 9000) - co the mat 2-3 phut ..." Yellow
        $null = Wait-ForPort -Port 9000 -TimeoutSeconds 180 -ServiceName "Keycloak"
        Log "  [WAIT] Cho Fineract (port 8443) ..." Yellow
        $null = Wait-ForPort -Port 8443 -TimeoutSeconds 180 -ServiceName "Fineract"
    } else {
        Log "  [SKIP] Khong tim thay $fineractPath" Yellow
    }

    # 1.2 eKYC Service
    $ekycPath = "$ROOT\ekyc_service"
    if (Test-Path $ekycPath) {
        Start-DockerCompose -Path $ekycPath -Name "eKYC Service"
        $null = Wait-ForPort -Port 8000 -TimeoutSeconds 60 -ServiceName "eKYC"
    }

    # 1.3 AI Score Service
    $aiscorePath = "$ROOT\aiscore_service"
    if (Test-Path $aiscorePath) {
        Start-DockerCompose -Path $aiscorePath -Name "AI Score Service"
        $null = Wait-ForPort -Port 8001 -TimeoutSeconds 60 -ServiceName "AI Score"
    }

    # 1.4 Memory Service
    $memoryPath = "$ROOT\memory-service"
    if (Test-Path "$memoryPath\docker-compose.memory.yml") {
        Start-DockerCompose -Path $memoryPath -Name "Memory Service (Neo4j + Qdrant)" -File "docker-compose.memory.yml"
        $null = Wait-ForPort -Port 5055 -TimeoutSeconds 60 -ServiceName "Memory Service"
    }

} else {
    Log "  [SKIP] Bo qua Docker services" Yellow
}

# -----------------------------------------------------------------
# PHASE 1b: Blockchain (WSL2 - manual)
# -----------------------------------------------------------------
if (-not $NoBlockchain) {
    Step "[Phase 1b] Blockchain Hyperledger Fabric (Huong dan thu cong)"
    Log "  Blockchain can chay trong WSL2:" Cyan
    Log "    1. Mo terminal WSL2 (wsl)" Cyan
    Log "    2. cd /mnt/g/Workspace/Study/HK2_2025-2026/KTPM/Project/p2p-do-an" Cyan
    Log "    3. source ./fabric-samples/.network" Cyan
    Log "    4. fabric_test_network_reset" Cyan
    Log "    5. fabric_test_network_deploy 1" Cyan
    Log "    6. fabric_backend_sync" Cyan
}

# -----------------------------------------------------------------
# PHASE 2: NestJS Backend
# -----------------------------------------------------------------
Step "[Phase 2] Khoi dong Backend NestJS (port 3001)"

$serverPath = "$ROOT\server_do_an_new"

if (-not (Test-Path "$serverPath\.env")) {
    if (Test-Path "$serverPath\.env.example") {
        Copy-Item "$serverPath\.env.example" "$serverPath\.env"
        Log "  [OK] Tao .env tu .env.example" Green
    } else {
        Log "  [WARN] Khong co .env! Tao file .env truoc khi chay." Yellow
    }
}

if (-not (Test-Path "$serverPath\node_modules")) {
    Log "  [NPM] Cai dependencies NestJS ..." Cyan
    Push-Location $serverPath
    npm install --silent
    Pop-Location
}

Start-InNewWindow -Title "NestJS Backend :3001" -WorkDir $serverPath -Command "npm run start:dev"
Start-Sleep -Seconds 8
$null = Wait-ForPort -Port 3001 -TimeoutSeconds 30 -ServiceName "NestJS Backend"

# -----------------------------------------------------------------
# PHASE 3: Frontends
# -----------------------------------------------------------------
if (-not $NoFrontend) {
    Step "[Phase 3] Khoi dong Frontend"

    # 3.1 Admin Web
    $adminPath = "$ROOT\admin_web"
    if (Test-Path "$adminPath\package.json") {
        if (-not (Test-Path "$adminPath\node_modules")) {
            Log "  [NPM] Cai dependencies Admin Web ..." Cyan
            Push-Location $adminPath
            npm install --silent
            Pop-Location
        }
        Start-InNewWindow -Title "Admin Web :5174" -WorkDir $adminPath -Command "npm run dev"
    }

    # 3.2 Mobile App
    if (-not $NoMobile) {
        $mobilePath = "$ROOT\client_new"
        if (Test-Path "$mobilePath\package.json") {
            if (-not (Test-Path "$mobilePath\node_modules")) {
                Log "  [NPM] Cai dependencies Mobile App ..." Cyan
                Push-Location $mobilePath
                npm install --silent
                Pop-Location
            }
            Start-InNewWindow -Title "Mobile App (Expo)" -WorkDir $mobilePath -Command "npm start"
        }
    }
} else {
    Log "  [SKIP] Bo qua Frontend" Yellow
}

# -----------------------------------------------------------------
# SUMMARY
# -----------------------------------------------------------------
Step "[Hoan tat] Tong ket"

$duration = [int]((Get-Date) - $START_TIME).TotalSeconds

Write-Host ""
Write-Host "  ================================================" -ForegroundColor Green
Write-Host "    STARTUP DONE! (${duration}s)" -ForegroundColor Green
Write-Host "  ================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  SERVICES:" -ForegroundColor Green
Write-Host "    NestJS API       -> http://localhost:3001" -ForegroundColor Cyan
Write-Host "    Swagger Docs     -> http://localhost:3001/api" -ForegroundColor Cyan
Write-Host "    Admin Web        -> http://localhost:5174" -ForegroundColor Cyan
Write-Host "    Mobile App       -> Expo (QR code in Expo window)" -ForegroundColor Cyan
Write-Host "    Fineract API     -> https://localhost:8443" -ForegroundColor Cyan
Write-Host "    Keycloak Admin   -> http://localhost:9000" -ForegroundColor Cyan
Write-Host "    Mifos Web UI     -> http://localhost:4200" -ForegroundColor Cyan
Write-Host "    eKYC Service     -> http://localhost:8000" -ForegroundColor Cyan
Write-Host "    AI Score         -> http://localhost:8001" -ForegroundColor Cyan
Write-Host "    Memory Service   -> http://localhost:5055" -ForegroundColor Cyan
Write-Host "    Neo4j Browser    -> http://localhost:7475" -ForegroundColor Cyan
Write-Host "    Qdrant           -> http://localhost:6333" -ForegroundColor Cyan
Write-Host ""
Write-Host "  TIPS:" -ForegroundColor Yellow
Write-Host "    .\start-all.ps1 -Quick       # Docker da chay san" -ForegroundColor Yellow
Write-Host "    .\start-all.ps1 -NoFrontend  # Chi backend" -ForegroundColor Yellow
Write-Host "    .\start-all.ps1 -NoMobile    # Khong mo mobile" -ForegroundColor Yellow
Write-Host "    Log file: $LOG_FILE" -ForegroundColor Yellow
Write-Host ""

Set-Location $ROOT