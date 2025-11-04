import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class createdBy {
  @ApiProperty({
    example: '64f1b2c3d4e5f6a7b8c9d0e1',
    description: 'ID của người tạo',
  })
  @IsNotEmpty({ message: 'CreatedBy không được để trống' })
  _id: string;
  @ApiProperty({
    example: 'creator@gmail.com',
    description: 'Email của người tạo',
  })
  @IsNotEmpty({ message: 'CreatedBy không được để trống' })
  email: string;
}

//data transfer object
export class CreateUserDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Tên người dùng' })
  @IsNotEmpty({ message: 'Name không được để trống' })
  name: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email người dùng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @ApiProperty({ example: '123456', description: 'Mật khẩu' })
  @IsNotEmpty({ message: 'Pass không được để trống' })
  password: string;

  @ApiProperty({ example: 22, description: 'Tuổi người dùng' })
  @IsNotEmpty({ message: 'Age không được để trống' })
  age: number;

  @ApiProperty({ example: 'male', description: 'Giới tính' })
  @IsNotEmpty({ message: 'Gender không được để trống' })
  gender: string;

  @ApiProperty({ example: 'Hà Nội', description: 'Địa chỉ' })
  @IsNotEmpty({ message: 'Address không được để trống' })
  address: string;

  @ApiProperty({ example: 'USER', description: 'Vai trò' })
  @IsNotEmpty({ message: 'Role không được để trống' })
  role: string;

  @ApiProperty({ type: createdBy, description: 'Người tạo' })
  @ValidateNested()
  @Type(() => createdBy)
  createdBy: createdBy;
}

export class RegisterUserDto {
  @ApiProperty({ example: 'Nguyen Van A', description: 'Tên người dùng' })
  @IsNotEmpty({ message: 'Name không được để trống' })
  name: string;

  @ApiProperty({ example: 'user@gmail.com', description: 'Email người dùng' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @ApiProperty({ example: '123456', description: 'Mật khẩu' })
  @IsNotEmpty({ message: 'Pass không được để trống' })
  password: string;

  @ApiProperty({ example: 22, description: 'Tuổi người dùng' })
  @IsNotEmpty({ message: 'Age không được để trống' })
  age: number;

  @ApiProperty({ example: 'male', description: 'Giới tính' })
  @IsNotEmpty({ message: 'Gender không được để trống' })
  gender: string;

  @ApiProperty({ example: 'Hà Nội', description: 'Địa chỉ' })
  @IsNotEmpty({ message: 'Address không được để trống' })
  address: string;
}
