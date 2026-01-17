import { IsString, IsEmail, IsOptional, MinLength, IsIn } from 'class-validator';

export class RegisterDto {
    @IsString()
    @MinLength(2)
    firstName: string;

    @IsString()
    @MinLength(2)
    lastName: string;

    @IsString()
    @MinLength(10)
    phoneNumber: string;

    @IsEmail()
    @IsOptional()
    email?: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsString()
    @IsOptional()
    @IsIn(['borrower', 'lender'])
    userType?: 'borrower' | 'lender';
}

export class LoginDto {
    @IsString()
    username: string;

    @IsString()
    password: string;
}
