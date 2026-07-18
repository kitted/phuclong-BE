import { PublicController } from '../decorators/swagger';
import { Body, Get, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { CreateUserDto } from 'src/collection/users/dtos/create-user.dto';
import { UsersService } from 'src/collection/users/users.service';

@PublicController(['users'])
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @ApiOperation({ summary: 'wakeup' })
  @Get('')
  async wakeup() {
    return await this.service.wakeup();
  }
}
