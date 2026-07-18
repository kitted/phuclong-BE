import { Body, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { AdminController } from '../decorators/swagger';
import { UsersService } from 'src/collection/users/users.service';
import { CreateUserDto } from 'src/collection/users/dtos/create-user.dto';

@AdminController(['users'])
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @ApiOperation({ summary: 'create' })
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return await this.service.create(dto);
  }
}
