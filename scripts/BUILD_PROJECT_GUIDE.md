# Hướng dẫn build lại dự án Fineract

## Cách nhanh (để kiểm tra gấp)
1. Mở `cmd` (user thích cmd):  
   ```cmd
   cmd /c "cd /d C:\pj\fullstack-wallet\fineract-dev && gradlew.bat :fineract-provider:clean :fineract-provider:bootJar -x test -x checkstyleMain -x checkstyleTest -x cucumber -x spotlessGroovyGradleCheck -x spotlessJavaCheck -x spotlessJava -x spotbugsMain -x spotlessMiscCheck -x spotlessMisc"
   ```
   - Sinh `fineract-provider/build/libs/fineract-provider-0.1.0-SNAPSHOT.jar` sẵn vì Dockerfile giờ chỉ copy bootJar này.
2. Build image Docker:
   ```cmd
   cmd /c "cd /d C:\pj\fullstack-wallet\fineract-dev && docker compose -f docker-compose.yml build"
   ```
3. Khởi động dịch vụ:
   ```cmd
   cmd /c "cd /d C:\pj\fullstack-wallet\fineract-dev && docker compose -f docker-compose.yml up -d"
   ```
4. Logs nhanh:
   ```cmd
   docker compose -f docker-compose.yml logs -f fineract
   ```

## Cách chắc chắn (đúng chuẩn Apache)
1. Chạy đầy đủ Gradle:
   ```cmd
   cmd /c "cd /d C:\pj\fullstack-wallet\fineract-dev && gradlew.bat clean build"
   ```
   - Nếu fail do Spotless/Checkstyle, chạy lần lượt:
     - `gradlew.bat spotlessApply`
     - `gradlew.bat checkstyleMain checkstyleTest`
     - Sửa lỗi SpotBugs theo report `fineract-provider/build/reports/spotbugs/*.html`.
   - Sau khi build xong, đảm bảo tồn tại file `fineract-provider/build/libs/fineract-provider-0.1.0-SNAPSHOT.jar`.
2. Khi `gradlew clean build` pass, build Docker:
   ```cmd
   cmd /c "cd /d C:\pj\fullstack-wallet\fineract-dev && docker compose -f docker-compose.yml build"
   ```
3. Khởi động dịch vụ:
   ```cmd
   cmd /c "cd /d C:\pj\fullstack-wallet\fineract-dev && docker compose -f docker-compose.yml up -d --remove-orphans"
   ```
4. Kiểm tra sức khỏe:
   - DB: `docker exec -it mariadb mysql -uroot -p` (mật khẩu trong env).
   - Fineract REST: `curl -I http://localhost:8080/fineract-provider/api/v1/tenants`.

## Lưu ý chung
- Nếu build Docker chạy `./gradlew` bên trong container, mọi lỗi checkstyle/spotless chưa fix sẽ làm build fail → nên đảm bảo bước 1 đã pass.
- Khi đổi branch lớn, nên xóa thư mục `fineract-provider/build` trước khi build nhanh để tránh JAR cũ.
- Logs container quá dài ⇒ dùng `docker compose down -v` trước khi build lại để tránh volume cũ gây lỗi khóa file.

