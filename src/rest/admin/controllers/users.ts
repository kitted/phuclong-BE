import { Body, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { AdminController } from '../decorators/swagger';
import { UsersService } from 'src/collection/users/users.service';
import { ChangeUserStatusDto, CreateUserDto, UpdateUserDto, UserListQueryDto } from 'src/collection/users/dtos/create-user.dto';
import { AuthRequest } from 'src/collection/auth/interfaces/authRequest.interface';

@AdminController(['users'])
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @ApiOperation({ summary: 'create' })
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'List and search employees' })
  @Get()
  findAll(@Query() query: UserListQueryDto) {
    return this.service.findAllAdmin(query);
  }

  @ApiOperation({ summary: 'Get employee summary' })
  @Get('summary')
  summary() {
    return this.service.getAdminSummary();
  }

  @ApiOperation({ summary: 'Get employee detail' })
  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: ID) {
    return this.service.findOneAdmin(String(id));
  }

  @ApiOperation({ summary: 'Get employee sales KPI' })
  @Get(':id/sales-kpi')
  salesKpi(@Param('id', ParseIdPipe) id: ID, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.salesKpi(String(id), from, to);
  }

  @ApiOperation({ summary: 'Update employee' })
  @Patch(':id')
  update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateUserDto) {
    return this.service.updateAdmin(String(id), dto);
  }

  @ApiOperation({ summary: 'Lock or unlock employee account' })
  @Patch(':id/status')
  status(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: ChangeUserStatusDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.changeAdminStatus(String(id), dto, this.currentUserId(request));
  }

  @ApiOperation({ summary: 'Soft-delete employee account' })
  @Delete(':id')
  remove(@Param('id', ParseIdPipe) id: ID, @Req() request: AuthRequest) {
    return this.service.removeAdmin(String(id), this.currentUserId(request));
  }

  private currentUserId(request: AuthRequest) {
    const user: any = request.user;
    return String(user?.id || user?._id || user?._doc?._id || '');
  }
}
