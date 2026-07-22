import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwtPayload.interface';
import { jwtConstants } from '../interfaces/auth.const';
import { UsersService } from 'src/collection/users/users.service';

@Injectable()
export class Jwt2faStrategy extends PassportStrategy(
  Strategy,
  'jwt-two-factor',
) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.id);
    if (!user) {
      return;
    }
    const value: any = typeof (user as any).toObject === 'function' ? (user as any).toObject() : ((user as any)._doc || user);
    return { ...value, id: String(value._id || value.id) };
  }
}
