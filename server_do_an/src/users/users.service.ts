import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateUserDto } from '@users/dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '@users/schemas/user.schema';
import mongoose, { Model, ObjectId, Types } from 'mongoose';
import { genSaltSync, hashSync, compareSync } from 'bcryptjs';
import { CreateUserDto, RegisterUserDto } from '@users/dto/create-user.dto';
import type { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { iUser } from '@users/user.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) // tiêm model mapping

    //cách tiêm 1 model bình thường của mongoose
    // @InjectModel('User') private userModel: Model<User
    //cách tiêm 1 model đã được thêm plugin soft delete
    private userModel: SoftDeleteModel<UserDocument>,
  ) { }
  

  getHashPassword = (pass: string): string => {
    const saltRounds = 10;
    const salt = genSaltSync(saltRounds);
    const hash = hashSync(pass, salt);
    return hash;
  };

  async checkEmail(email: string) {
    const isExistEmail = await this.findOneByEmail(email);
    if (isExistEmail) {
      throw new BadRequestException('Email đã tồn tại');
    } else {
      return true;
    }
  }

  async create(user: CreateUserDto, iUser: iUser) {
    user.password = await this.getHashPassword(user.password);
    user.createdBy = {
      _id: iUser._id,
      email: iUser.email,
    };

    await this.checkEmail(user.email);

    const newUser = await this.userModel.create(user);
    return newUser;
  }

  async register(user: RegisterUserDto | any) {
    await this.checkEmail(user.email);
    user.password = await this.getHashPassword(user.password);
    const newUser = this.userModel.create(user);
    return newUser;
  }

  async findAll(currentPage: number, limit: number, qs: string) {
    const aqp = (await import('api-query-params')).default;
    const { filter, sort, projection, population } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const offset = (+currentPage - 1) * +limit;
    const defaultLimit = +limit ? +limit : 10;

    const totalItems = (await this.userModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    // if (isEmpty(sort)) {
    //   // @ts-ignore: Unreachable code error
    //   sort = "-updatedAt"
    // }

    const result = await this.userModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .exec();

    // result.map((x) => { delete x.password })
    return {
      meta: {
        currentPage: currentPage, //trang hiện tại
        pageSize: limit, //số lượng bản ghi đã lấy
        pages: totalPages, //tổng số trang với điều kiện query
        total: totalItems, // tổng số phần tử (số bản ghi)
      },
      result, //kết quả query
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID không hợp lệ');
    }
    const user = await this.userModel.findOne({ _id: id }).exec();

    if (!user) {
      throw new NotFoundException('Không tìm thấy user');
    }

    return user;
  }

  async findOneByEmail(email: string) {
    const user = await this.userModel.findOne({ email: email }).exec();
    return user;
  }

  async findOneByPhoneOrEmail(identifier: string) {
    // Try to find by email first (if it looks like email)
    if (identifier.includes('@')) {
      const user = await this.userModel.findOne({ email: identifier }).exec();
      if (user) return user;
    }

    // Try to find by phone (convert to local base format)
    const phoneFormats = [
      identifier, // as-is
      identifier.startsWith('+84') ? '0' + identifier.substring(3) : null, // +84 -> 0
      identifier.startsWith('84') && !identifier.startsWith('+84') ? '0' + identifier.substring(2) : null, // 84 -> 0
    ].filter(Boolean);

    for (const phone of phoneFormats) {
      const user = await this.userModel.findOne({ phone }).exec();
      if (user) return user;
    }

    return null;
  }

  async findOneByRefreshToken(token: string) {
    const user = await this.userModel.findOne({ refreshToken: token }).exec();
    return user;
  }

  isValidPass(pass: string, hash: string): boolean {
    return compareSync(pass, hash);
  }

  async update(id: string, updateUserDto: UpdateUserDto, user: iUser) {
    // Kiểm tra xem id có hợp lệ hay không
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ID ${id} không hợp lệ`);
    }

    if (updateUserDto.password) {
      updateUserDto.password = await this.getHashPassword(
        updateUserDto.password,
      );
    }

    // Thực hiện cập nhật bằng updateOne
    const result = await this.userModel.updateOne(
      { _id: id },
      {
        ...updateUserDto,

        $set: {
          updatedBy: {
            _id: user._id,
            name: user.name,
          },
        },
      },
    );
    console.log(result);
    return result;
  }

  //sever remove
  async remove(id: string, user: iUser) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`ID ${id} không hợp lệ`);
    }
    await this.userModel.updateOne(
      { _id: id },
      {
        $set: {
          deletedBy: {
            _id: user._id,
            name: user.name,
          },
        },
      },
    );

    // Thực hiện cập nhật bằng updateOne
    return await this.userModel.softDelete({ _id: id });
  }

  async updateUserToken(id: string | ObjectId, refreshToken: string) {
    return await this.userModel.updateOne(
      { _id: id },
      {
        $set: {
          refreshToken: refreshToken,
        },
      },
    );
  }
}
