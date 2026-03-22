---
name: backend-convention
description: Tiêu chuẩn và Code Convention chuyên nghiệp (Global Standard) cho dự án NestJS (server_do_an_new). Bắt buộc áp dụng cho mọi đoạn code mới và quá trình refactor.
---

# NestJS Professional Code Convention & Guidelines

Dự án `server_do_an_new` tuân theo bộ quy chuẩn chuyên nghiệp dành cho NestJS, được lấy cảm hứng từ các best practices của cộng đồng (NestJS by Kamil Myśliwiec, Google TypeScript Style Guide).

Mục tiêu: Đảm bảo tính clean, kiến trúc phân lớp rõ ràng (Layered Architecture), dễ bảo trì, dễ test, và hạn chế duplicate boilerplate ở mức tối đa.

## 1. Cấu trúc thư mục (Directory Structure)

Tuyệt đối tuân thủ cấu trúc module hướng tính năng (Feature-based Modular Structure).
- `src/common/`: Chứa các thành phần dùng chung toàn cục.
  - `decorators/`: Custom decorators (ví dụ: `@CurrentUser()`, `@Roles()`).
  - `filters/`: Exception filters (Bắt và chuẩn hóa error format).
  - `guards/`: Authorization/Authentication (Bảo vệ route, phân quyền).
  - `interceptors/`: Response mapping (bọc `statusCode`, `data`), Logging, Caching.
  - `middlewares/`: Express middlewares (Chỉ dùng khi xử lý cấp thấp của Request, ưu tiên Interceptor/Guard).
  - `utils/`: Các hàm Helpers (Pure functions, không sử dụng Dependency Injection).
- `src/config/`: Configuration files (đọc biến môi trường, setup database, swagger schema).
- `src/modules/`: Chứa các feature (nghiệp vụ). Mỗi feature phải nằm gọn trong thư mục của nó. Mọi logic liên quan chặt chẽ với nhau thuộc cùng 1 context phải gom chung.
  - `dto/`: Data Transfer Objects đi kèm validation từ class-validator và swagger annotations.
  - `schemas/` (hoặc `entities/`): Models liên kết database (Mongoose).
  - `repositories/` (Optional): Nơi chứa logic giao tiếp DB cực phức tạp hoặc dùng aggregate (nếu quá dài so với Service).
  - `interfaces/` / `types/`: Type definitions riệng đặc thù của module.
  - `[feature].controller.ts`: Entrypoint nhận HTTP request định hướng route.
  - `[feature].service.ts`: Xử lý business logic cốt lõi.
  - `[feature].module.ts`: Khởi tạo và liên kết provider của module.

## 2. Naming Conventions (Quy tắc đặt tên)

- **Tên thư mục & file**: `kebab-case`. Ví dụ: `user-profile.controller.ts`, `auth.service.ts`, `dto/create-user.dto.ts`.
- **Tên Class**: `PascalCase`. Ví dụ: `UserProfileController`, `AuthService`.
- **Tên tham số, biến, method**: `camelCase`. Ví dụ: `findUserById`, `userId`, `isActive`. Hàm trả về boolean nên bắt đầu bằng `is`, `has`, `can`, `should`.
- **Tên hằng số (Constants/Enums)**: `UPPER_SNAKE_CASE`. Ví dụ: `MAX_UPLOAD_SIZE`, `UserRole.ADMIN`. Không dùng enum hỗn hợp (mixed type).
- **Tên Interface / Type**: `PascalCase`. Không dùng tiền tố `I` (vd: `UserPayload` thay vì `IUserPayload`) ngoại trừ một số domain core bắt buộc.
- **Hậu tố (Suffixes)**: Class phải có hậu tố thể hiện rõ bản chất của nó: `*Controller`, `*Service`, `*Module`, `*Dto`, `*Guard`, `*Interceptor`, `*Filter`, `*Schema`.

## 3. Kiến trúc Phân Lớp (Layered Architecture) & Nhiệm vụ

### 3.1. Controllers (`*.controller.ts`)
- **Nhiệm vụ**: Chịu trách nhiệm về cầu nối HTTP. Nhận request, lấy body/query parameters, ném sang Service xử lý, và trả về dữ liệu cho Client.
- **Nguyên tắc**:
  - Không chứa Business Logic, lệnh tính toán toán học phức tạp, hoặc các lời gọi trực tiếp DB bằng `Model`.
  - KHÔNG được thủ công bọc response (ví dụ: `return { statusCode: 200, message: 'OK', data }`). Chuyển việc này cho **Global Transform Interceptor**. Controller chỉ **return trực tiếp payload/obj `data`**. Hoặc ném Exception nếu lỗi.
  - Phải có chú thích Swagger đầy đủ: `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()` cho tự động generate docs.
  
### 3.2. Services (`*.service.ts`)
- **Nhiệm vụ**: Triển khai Business Logic cốt lõi của công ty/nghiệp vụ.
- **Nguyên tắc**:
  - Khuyến khích chia nhỏ service bự. Một class service nên chịu trách nhiệm trong domain vừa phải (Single Responsibility).
  - KHÔNG BAO GIỜ NHẬN `Request` hay `Response` của package `express`/`fastify`. Service phải độc lập để khi đổi protocol sang gRPC hay Websocket code ko bị hỏng.
  - Ném `HttpException` (ví dụ `NotFoundException()`, `BadRequestException()`, `UnauthorizedException()`) để controller/global filter tự wrap lại format HTTP chuẩn.
  - Tách hàm Helper ra method `private` nếu chung class, hoặc hàm utils độc lập.
  - Không gây Circular Dependency (Inject chéo).

### 3.3. DTOs: Data Transfer Objects (`*.dto.ts`)
- **Nhiệm vụ**: Quy định type và Validate ranh giới ngoài cùng của payload (`@Body()`, `@Query()`, `@Param()`).
- **Nguyên tắc**:
  - Dùng tối đa `class-validator` (e.g., `@IsString()`, `@IsNotEmpty()`, `@IsOptional()`) và `class-transformer` (e.g., `@Type()`, `@Transform()`). Luôn dùng `@IsOptional()` đối với parameter ko bắt buộc để tránh báo bug.
  - Mọi Field public API phải có Decorator xác định nguồn Swagger (`@ApiProperty()` hoặc `@ApiPropertyOptional()`).
  - Kế thừa DTO bằng các tiện ích `PartialType`, `OmitType`, `PickType` từ `@nestjs/swagger` để tái cấu trúc. Không copy paste lại fields.

### 3.4. Database & Schemas (`*.schema.ts`)
- **Nhiệm vụ**: Định nghĩa cấu trúc document lưu ở collection MongoDB.
- **Nguyên tắc**:
  - Dùng `@Schema()`, `@Prop()` của `@nestjs/mongoose`. Phải định nghĩa explicitly Schema Types thay vì ngầm định.
  - Sử dụng Index `@Index()` tại Schema Class trực tiếp để tăng tốc query.

### 3.5. Guards, Interceptors & Filters
- **Guards (`*.guard.ts`)**: Xác định quyền (Authentication/Authorization) cực nhanh trước controller. Return `boolean` hoặc ném `UnauthorizedException` / `ForbiddenException`.
- **Interceptors (`*.interceptor.ts`)**: Sửa Data luồng vào (req) / luồng ra (res). Nơi lý tưởng để wrap standard response (`statusCode`, `message`, `data`).
- **Filters (`*.filter.ts`)**: Hố đen gom Exception. Bắt tất cả lỗi crash (MongoError duplicate, Server down) trước khi frontend nhận được stack trace Node.

## 4. Best Practices Khác

1. **Say No to `any`**: Tránh `any` bừa bãi. Mọi tham số đều nên có type. Nếu logic trả về đối tượng chưa map kịp, dùng interface/type definition. Nếu chưa rõ kiểu, dùng `unknown`.
2. **Current User Extraction**: 
   - Thay vì dùng `req.user.something` rải rác:
   ```typescript
   // BAD
   async getProfile(@Req() req: Request) { const id = req.user.id; ... }
   ```
   - Chuyển hẳn định tuyến:
   ```typescript
   // GOOD
   async getProfile(@CurrentUser('id') userId: string) { ... }
   ```
3. **Environment & Configuration**: Không rải rác cú pháp `process.env.ABC` everywhere. Toàn bộ setting DB, Port phải đọc qua `@nestjs/config` (ConfigService).
4. **Try-Catch Flow**:
   - Controller KHÔNG CẦN try-catch trừ khi muốn chặn override Error Status tĩnh. Để Exception thoát ra ngoài tự do đến **Global Exception Filter**.
   - Bên trong Service chỉ bọc `try-catch` nếu đó là hành vi gọi third-party API có fail rates (như HTTP Axios external API), hay chặn Transaction Mongo.
5. **Code Style/Linting**: Tuân thủ config `.prettierrc` của dự án và KHÔNG được Ignore ESLint warnings nếu không có nguyên do cụ thể. File test nên theo tên `*.spec.ts`. Tham số nên sắp xếp gọn gàng.

## 5. Clean Code, Tái sử dụng & Tối ưu hóa (Clean Code Rules)

1. **Rule of 3 (Tái sử dụng Code)**: Nếu một đoạn logic (tính toán, format data, truy vấn DB) xuất hiện từ 3 lần trở lên ở các nơi khác nhau, **BẮT BUỘC** phải tách ra thành Helper Function (nếu là pure logic) hoặc Shared Service (nếu cần truy cập DB/DI). Tuyệt đối không copy-paste code.
2. **Tạo Custom Decorators**: 
   - Nếu liên tục lặp lại các đoạn logic trích xuất Request (ví dụ: `req.headers['x-device-id']`), hãy chủ động tạo custom `@Decorator` (ví dụ `@DeviceId()`) trong `src/common/decorators`.
   - Sử dụng Decorator kết hợp Reflector để đánh dấu API (vd: `@Public()`, `@RequireConfig()`) thay vì if/else bằng hard-code path trong Guard/Interceptor.
3. **Giới hạn Độ dài File (File Splitting)**:
   - Một file `*.controller.ts` hoặc `*.service.ts` **KHÔNG NÊN VƯỢT QUÁ 400-500 dòng**. Đừng để code trở thành "God Class".
   - Nếu Controller quá bành trướng, hãy phân rã thành các sub-controllers dưới cùng module (ví dụ: tách `admin.controller.ts` thành `admin-users.controller.ts`, `admin-settings.controller.ts`).
   - Nếu Service quá béo (Fat Service), hãy áp dụng Facade Pattern. Tách bớt nghiệp vụ sang các private service nhỏ hơn hoặc helper module, chia để trị.
4. **Giới hạn Độ dài Hàm (Function Length & Extract Method)**:
   - Một hàm (method) **NÊN CHỈ DÀI 30-40 dòng code**. Nếu dài gấp 3, gấp 4 lần, đó là dấu hiệu nó đang làm quá nhiều nhiệm vụ (vi phạm Single Responsibility).
   - "Early Return": Hạn chế viết Code lồng nhau (Nested Code / Arrow Code) quá sâu. Thay vì if/else lồng tới 3-4 cấp, hãy `throw Exception` hoặc `return` tĩnh ngay ở đầu khối hàm khi điều kiện không thỏa.
   - Rút ngắn hàm bằng **"Extract Method"**: Khi một hàm đang gánh một luồng phức tạp (Lấy DB -> Validation -> Xử lý API -> Map Response), **BẮT BUỘC** phải cắt nhỏ thân của nó ra thành nhiều hàm `private` (VD: `private async validateDeposit()`, `private callPaymentGateway()`). Lợi ích là hàm chính giờ đây đọc như một câu chuyện tường minh, nhìn tên các hàm con là người dùng có thể mường tượng luồng chạy một cách gọn gàng.

## 6. Ví dụ Chuẩn (Standard Patterns)

### 6.1. Controller (Slim and Clear)
```typescript
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin người dùng' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }
    // LƯU Ý: Rất sạch sẽ, không tự serialize { statusCode, data }
    return user; 
  }
}
```

### 6.2. Service Error Throws
```typescript
@Injectable()
export class ContractService {
  async approveDocument(documentId: string): Promise<Document> {
    const doc = await this.docModel.findById(documentId);
    if (!doc) throw new NotFoundException(`Document ${documentId} not found`);
    if (doc.status === 'APPROVED') throw new BadRequestException('Already approved');
    
    doc.status = 'APPROVED';
    return doc.save();
  }
}
```

### 6.3. DTO với Validation và Swagger Type
```typescript
import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'john.doe@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiPropertyOptional({ example: '+84988123456' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
```
