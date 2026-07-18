import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { ReturnModelType } from '@typegoose/typegoose';
import { InjectModel } from 'nestjs-typegoose';
import { ResetToken } from './schemas/resetToken.schema';
import { JwtPayload } from './interfaces/jwtPayload.interface';
import { jwtConstants } from './interfaces/auth.const';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { LoginByPasswordDto } from './dtos/login-by-password.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(ResetToken)
    private readonly module: ReturnModelType<typeof ResetToken>,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async getTokenFromUser(payload: LoginByPasswordDto) {
    const user = await this.credentialByPassword(
      payload.username,
      payload.password,
    );

    if (!user)
      throw new HttpException(
        'Sai username hoặc password!',
        HttpStatus.BAD_REQUEST,
      );
    return await this.getToken(user);
  }

  async getToken(user: any) {
    const token = await this.module.findOne({ userId: user.id });
    if (token) {
      await this.module.findByIdAndDelete(token._id);
    }

    const payload: JwtPayload = {
      id: user._id,
      role: user.role,
    };

    const refresh_token = await this.jwtService.signAsync(payload, {
      secret: jwtConstants.secret_refresh,
      expiresIn: jwtConstants.expiresInRefresh,
    });

    const newToken = randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(newToken, 10);

    await new this.module({
      userId: user.id,
      token: hash,
      createdAt: Date.now(),
    }).save();

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token,
      role: user.role,
    };
  }

  async credentialByPassword(username: string, password: string) {
    const user = await this.usersService.findUserForLogin(username);

    if (!user) {
      throw new HttpException(
        'Sai username hoặc password!',
        HttpStatus.BAD_REQUEST,
      );
    }
    const userPassword: any = user.password;
    const match = await bcrypt.compare(password, userPassword);

    if (!match) {
      throw new HttpException(
        'Sai username hoặc password!',
        HttpStatus.BAD_REQUEST,
      );
    }
    return user;
  }

  async getUserFromJwtPayload({ id }: JwtPayload) {
    const user = await this.usersService.getProfile(id);
    if (!user)
      throw new HttpException('Không tìm thấy User!', HttpStatus.NO_CONTENT);
    return user;
  }

  async refreshToken(dto: RefreshTokenDto) {
    const payload = await this.jwtService.verifyAsync(dto.reset_token, {
      secret: jwtConstants.secret_refresh,
    });
    if (!payload.id) {
      throw new HttpException('Token is incorrect!', HttpStatus.BAD_REQUEST);
    }
    const user = await this.usersService.findById(payload?.id);
    if (!user) {
      throw new HttpException('Account not found!', HttpStatus.BAD_REQUEST);
    }

    return await this.getToken(user);
  }

  async changePassword(jwt: JwtPayload, dto: ChangePasswordDto) {
    const token = await this.module.findOne({ userId: jwt.id }).exec();
    if (token) await token.deleteOne();
    const user = await this.usersService.changePassword(jwt, dto);
    return await this.getToken(user);
  }

  async initAdmin() {
    const admin = await this.usersService.findAdmin();
    if (!admin) {
      await this.usersService.createAdmin({
        username: 'admin',
        password: 'Abc@123',
      });
    }
    return;
  }

  async init() {
    await Promise.all([this.initAdmin()]);
  }
}
