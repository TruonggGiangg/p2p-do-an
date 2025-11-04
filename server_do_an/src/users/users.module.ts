import { Module } from '@nestjs/common';
import { UsersService } from '@users/users.service';
import { UsersController } from '@users/users.controller';

import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ], // khai báo dùng model mongoose truyền vào User
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
