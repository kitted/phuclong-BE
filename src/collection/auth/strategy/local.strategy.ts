import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'username',
      passwordField: 'password',
    });
  }

  async validate(username: string, password: string): Promise<any> {
    let user = null;

    if (username && password) {
      user = await this.authService.credentialByPassword(username, password);
    }

    if (!user) {
      throw new UnauthorizedException('Không tìm thấy tài khoản!');
    }
    return user;
  }
}
