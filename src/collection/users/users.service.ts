import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from 'nestjs-typegoose';
import { Users } from './schemas/users.schema';
import { ReturnModelType } from '@typegoose/typegoose';
import { ID } from 'src/core/interfaces/id.interface';
import * as bcrypt from 'bcrypt';
import { RoleEnum } from './interfaces/role.enum';
import { JwtPayload } from '../auth/interfaces/jwtPayload.interface';
import { ChangePasswordDto } from '../auth/dtos/change-password.dto';
import { Logger } from '@nestjs/common'; // Thêm import này

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name); // Tạo instance logger
  constructor(
    @InjectModel(Users)
    private readonly userModel: ReturnModelType<typeof Users>,
  ) {}

  async getTest() {
    return 'abc';
  }

  async findUserForLogin(username: string) {
    return await this.getByLogin(username);
  }

  async getByLogin(username: string) {
    return await this.userModel.findOne({ username });
  }

  async findById(id: ID | string) {
    return await this.userModel.findById(id).select('-password');
  }

  async getProfile(id: ID) {
    const tmp = [
      {
        $match: {
          $expr: {
            $eq: ['$_id', { $toObjectId: id }],
          },
          isDeleted: false,
        },
      },
      {
        $project: {
          password: 0,
        },
      },
    ];

    const rs = await this.userModel.aggregate(tmp);

    if (rs.length > 0) {
      return rs[0];
    }
    return;
  }

  async findAdmin() {
    return this.userModel.findOne({
      username: 'admin',
      role: RoleEnum.ADMIN,
      isDeleted: false,
    });
  }

  async createAdmin(dto: { username: string; password: string }) {
    const newUser = new this.userModel({ ...dto, role: RoleEnum.ADMIN });
    newUser.password = await bcrypt.hash(dto.password, 10);

    const created: any = await newUser.save();

    return await this.findById(created._id);
  }

  async changePassword(jwt: JwtPayload, dto: ChangePasswordDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new HttpException(
        'Tài khoản nhập lại không chính xác!',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userModel.findById(jwt.id);
    // if (!user || user.role === RoleEnum.ADMIN) {
    //   throw new HttpException('Không tìm thấy User!', HttpStatus.BAD_REQUEST);
    // }

    const match = await bcrypt.compare(dto.oldPassword, user.password);

    if (!match) {
      throw new HttpException('Sai mật khẩu!', HttpStatus.UNAUTHORIZED);
    }
    const password = await bcrypt.hash(dto.password, 10);

    return this.userModel.findByIdAndUpdate(
      jwt.id,
      { password },
      {
        new: true,
      },
    );
  }

  async create(payload: any) {
    const password = await bcrypt.hash(payload.password, 10);
    return await this.userModel.create({ ...payload, password });
  }

  async wakeup() {
    console.log('wake up ... ');
    this.logger.log('wake up ...'); // Ghi log
    return await this.userModel.find();
  }
}
