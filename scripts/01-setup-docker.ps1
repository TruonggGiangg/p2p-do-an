# Script 01: Setup Docker và khởi động services
# Sử dụng: .\01-setup-docker.ps1

Write-Host "=== 01. SETUP DOCKER ===" -ForegroundColor Green

# 1. Kiểm tra Docker
Write-Host "`n1. Kiểm tra Docker..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version
    Write-Host "✅ Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker không được cài đặt!" -ForegroundColor Red
    exit 1
}

try {
    $composeVersion = docker-compose --version
    Write-Host "✅ Docker Compose: $composeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose không được cài đặt!" -ForegroundColor Red
    exit 1
}

# 2. Khởi động services
Write-Host "`n2. Khởi động services..." -ForegroundColor Yellow
try {
    docker-compose up -d
    Write-Host "✅ Services đã khởi động" -ForegroundColor Green
} catch {
    Write-Host "❌ Lỗi khởi động services: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Kiểm tra trạng thái services
Write-Host "`n3. Kiểm tra trạng thái services..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

$services = @("keycloak", "fineract")
foreach ($service in $services) {
    try {
        $status = docker-compose ps $service
        if ($status -match "Up") {
            Write-Host "✅ ${service}: Running" -ForegroundColor Green
        } else {
            Write-Host "❌ ${service}: Not running" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ ${service}: Error checking status" -ForegroundColor Red
    }
}

# 4. Đợi services sẵn sàng
Write-Host "`n4. Đợi services sẵn sàng..." -ForegroundColor Yellow
Write-Host "Đợi Keycloak khởi động (có thể mất 2-3 phút)..." -ForegroundColor Cyan

$maxAttempts = 30
$attempt = 0
do {
    $attempt++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9000" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Keycloak sẵn sàng!" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "⏳ Đợi Keycloak... ($attempt/$maxAttempts)" -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    }
} while ($attempt -lt $maxAttempts)

if ($attempt -ge $maxAttempts) {
    Write-Host "❌ Keycloak không khởi động được!" -ForegroundColor Red
    Write-Host "Kiểm tra logs: docker-compose logs keycloak" -ForegroundColor Yellow
    exit 1
}

# 5. Kiểm tra Fineract
Write-Host "`n5. Kiểm tra Fineract..." -ForegroundColor Yellow
$maxAttempts = 20
$attempt = 0
do {
    $attempt++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/fineract-provider/api/v1/offices" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 401) { # 401 is expected without auth
            Write-Host "✅ Fineract sẵn sàng!" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "⏳ Đợi Fineract... ($attempt/$maxAttempts)" -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    }
} while ($attempt -lt $maxAttempts)

if ($attempt -ge $maxAttempts) {
    Write-Host "❌ Fineract không khởi động được!" -ForegroundColor Red
    Write-Host "Kiểm tra logs: docker-compose logs fineract" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n=== HOÀN THÀNH SETUP DOCKER ===" -ForegroundColor Green
Write-Host "Keycloak: http://localhost:9000" -ForegroundColor Cyan
Write-Host "Fineract: http://localhost:8080" -ForegroundColor Cyan
Write-Host "Tiếp theo: .\02-setup-keycloak.ps1" -ForegroundColor Yellow
