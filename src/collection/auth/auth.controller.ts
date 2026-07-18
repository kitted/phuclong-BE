import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoginByPasswordDto } from './dtos/login-by-password.dto';
import { JwtAuthGuard } from './guards/jwt.guard';
import { JwtPayload } from './interfaces/jwtPayload.interface';
import { ChangePasswordDto } from './dtos/change-password.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { Auth } from './decorators/auth.decorator';

@ApiBearerAuth()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {
    this.authService.init().then().catch();
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'profile' })
  @Get('me')
  async me(@Auth() auth: JwtPayload) {
    return await this.authService.getUserFromJwtPayload(auth);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'change password' })
  @Post('change-password')
  async changePassword(
    @Auth() jwt: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return await this.authService.changePassword(jwt, dto);
  }

  @ApiOperation({ summary: 'refresh token' })
  @Post('refresh-token')
  async requestReset(@Body() payload: RefreshTokenDto) {
    return await this.authService.refreshToken(payload);
  }

  @ApiOperation({ summary: 'login with username, password' })
  @Post('login')
  async login(@Body() dto: LoginByPasswordDto) {
    return await this.authService.getTokenFromUser(dto);
  }
}
