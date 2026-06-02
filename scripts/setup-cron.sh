#!/bin/bash

SCRIPT_PATH="/opt/p2p/scripts/backup-logs.sh"
CRON_JOB="0 0 * * * $SCRIPT_PATH >> /opt/p2p/logs/backup-cron.log 2>&1"

echo "=== Setting up Backup Log Cron Job ==="

# 1. Đảm bảo script backup có quyền thực thi
if [ -f "$SCRIPT_PATH" ]; then
    chmod +x "$SCRIPT_PATH"
    echo "Set executable permission on $SCRIPT_PATH."
else
    echo "⚠️ Warning: $SCRIPT_PATH not found. Make sure scripts are deployed to /opt/p2p/scripts/"
fi

# 2. Đăng ký vào crontab của user hiện tại
# Kiểm tra xem cron job đã tồn tại trong crontab chưa
crontab -l 2>/dev/null | grep -q "$SCRIPT_PATH"
if [ $? -eq 0 ]; then
    echo "Cron job already registered. Skipping."
else
    # Thêm cron job mới mà không làm mất các cron job cũ
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Registered daily cron job successfully!"
    echo "Cron Schedule: Chạy lúc 00:00 hàng ngày."
fi

# Hiển thị danh sách cron jobs hiện tại
echo "=== Current Cron Jobs ==="
crontab -l
echo "========================="
