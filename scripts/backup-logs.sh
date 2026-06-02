#!/bin/bash

# Thư mục chứa log của NestJS
LOG_DIR="/opt/p2p/logs"
# Thư mục lưu trữ backup log
BACKUP_DIR="/opt/p2p/backups/logs"
# Thời gian lưu giữ log backup (ngày)
RETENTION_DAYS=30

echo "=========================================="
echo "Starting Log Backup: $(date)"
echo "=========================================="

# Tạo thư mục backup nếu chưa tồn tại
mkdir -p "$BACKUP_DIR"

# 1. Copy toàn bộ file log đã được Winston nén (.gz) sang thư mục backup
# Winston daily rotate sẽ tự động nén file log của ngày hôm trước thành dạng: app-YYYY-MM-DD.log.gz
if [ -d "$LOG_DIR" ]; then
    echo "Scanning for zipped logs in $LOG_DIR..."
    find "$LOG_DIR" -name "*.gz" -type f | while read -r logfile; do
        filename=$(basename "$logfile")
        if [ ! -f "$BACKUP_DIR/$filename" ]; then
            cp "$logfile" "$BACKUP_DIR/"
            echo "Copied $filename to backup directory."
        else
            echo "$filename already exists in backup, skipping."
        fi
    done
else
    echo "Directory $LOG_DIR does not exist. Skipping backup."
fi

# 2. Xóa các log backup cũ hơn 30 ngày để giải phóng dung lượng đĩa
echo "Cleaning up log backups older than $RETENTION_DAYS days in $BACKUP_DIR..."
if [ -d "$BACKUP_DIR" ]; then
    find "$BACKUP_DIR" -name "*.gz" -type f -mtime +$RETENTION_DAYS -delete -print | while read -r deleted; do
        echo "Deleted old backup: $(basename "$deleted")"
    done
fi

echo "Log Backup finished successfully at $(date)."
echo "=========================================="
