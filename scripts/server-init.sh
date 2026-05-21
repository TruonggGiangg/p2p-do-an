#!/bin/bash
# ============================================================
# P2P Server Initial Setup Script
# Run this ONCE on a fresh Ubuntu server
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}   P2P Server Initial Setup${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# 1. Update system
echo -e "${YELLOW}[1/5] Updating system...${NC}"
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Docker
echo -e "${YELLOW}[2/5] Installing Docker...${NC}"
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

# 3. Create Docker network
echo -e "${YELLOW}[3/5] Creating Docker network...${NC}"
docker network create p2p-network 2>/dev/null || echo -e "${YELLOW}Network exists${NC}"

# 4. Create app directory
echo -e "${YELLOW}[4/5] Creating app directory...${NC}"
sudo mkdir -p /opt/p2p
sudo chown ubuntu:ubuntu /opt/p2p

# 5. Create env file template
echo -e "${YELLOW}[5/5] Creating .env template...${NC}"
if [ ! -f /opt/p2p/.env.server ]; then
    cat > /opt/p2p/.env.server << 'ENVEOF'
# ==================== SERVER & APP ====================
PORT=3001
NODE_ENV=production
DEFAULT_EMAIL_DOMAIN=p2p.com

# ==================== JWT SECURITY ====================
JWT_SECRET=CHANGE_ME_production_jwt_secret_2026
JWT_EXPIRE=1h
JWT_REFRESH_SECRET=CHANGE_ME_production_refresh_secret_2026
JWT_REFRESH_EXPIRE=7d

# ==================== FINERACT CORE ====================
FINERACT_API_URL=http://13.212.213.100:8080/fineract-provider/api/v1
FINERACT_TENANT=default
FINERACT_USERNAME=mifos
FINERACT_PASSWORD=password

# ==================== KEYCLOAK IDENTITY ====================
KEYCLOAK_URL=http://13.212.213.100:9000
KEYCLOAK_REALM=fineract
KEYCLOAK_CLIENT_ID=community-app
KEYCLOAK_CLIENT_SECRET=real-client-secret-123
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KEYCLOAK_ADMIN_REALM=master
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli

# ==================== BUSINESS DEFAULTS ====================
DEFAULT_OFFICE_ID=1
DEFAULT_LEGAL_FORM_ID=1
DEFAULT_LOCALE=en
DEFAULT_DATE_FORMAT=dd MMMM yyyy
DEFAULT_EWALLET_PRODUCT_ID=1
DEFAULT_BNPL_LOAN_PRODUCT_ID=5
DEFAULT_BNPL_CREDIT_LIMIT=5000000

# ==================== AI SCORE ====================
AISCORE_ENABLED=false
AISCORE_SERVICE_URL=http://localhost:8001
AISCORE_TIMEOUT=15000

# ==================== SECURITY ====================
CORS_ORIGINS=*
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
RATE_LIMIT_TTL=60000
RATE_LIMIT_MAX=100
ENVEOF
    echo -e "${GREEN}Created /opt/p2p/.env.server${NC}"
    echo -e "${RED}[IMPORTANT] Edit /opt/p2p/.env.server with your real values!${NC}"
else
    echo -e "${YELLOW}.env.server exists, skipping${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}   Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo -e "  1. Edit /opt/p2p/.env.server with real secrets"
echo -e "  2. Set GitHub Secrets (see README)"
echo -e "  3. Push code to trigger CI/CD"
echo ""
