import { IsString, IsNotEmpty, Matches, MinLength, IsEmail, IsOptional, IsNumber, IsDateString, IsIn } from 'class-validator';

export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+84|84|0)[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;
}

export class ConfirmDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+84|84|0)[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu phải có ít nhất 6 ký tự' })
  password: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(borrower|lender|admin)$/, { message: 'Category không hợp lệ' })
  category: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  // User Profile Details (required for confirm)
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Tên phải có ít nhất 2 ký tự' })
  fullName: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string; // ISO 8601 format: YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  @IsIn(['male', 'female', 'other'], { message: 'Giới tính không hợp lệ' })
  gender: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Địa chỉ phải có ít nhất 5 ký tự' })
  address: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Thành phố phải có ít nhất 2 ký tự' })
  city: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$/, { message: 'Số CMND/CCCD phải là 9 chữ số' })
  ssn: string; // Citizen ID / Passport number

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Nghề nghiệp phải có ít nhất 2 ký tự' })
  job: string;

  @IsNumber()
  @IsNotEmpty()
  income: number; // Monthly income
}

export class SignInDto {
  @IsString()
  @IsNotEmpty()
  // Accept either phone number or email for login
  identifier: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}