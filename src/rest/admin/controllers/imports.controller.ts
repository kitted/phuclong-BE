import { Body, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { WarehouseController } from '../decorators/warehouse';
import { ImportsService } from 'src/collection/imports/imports.service';
import {
  ChangeImportStatusDto,
  CreateImportDto,
} from 'src/collection/imports/dtos/imports.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { AdminOnly } from '../decorators/admin-only';

@WarehouseController(['imports'])
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @ApiOperation({ summary: 'Create import' })
  @Post()
  @AdminOnly()
  async create(@Body() dto: CreateImportDto) {
    return await this.service.create(dto);
  }

  @ApiOperation({ summary: 'Get all imports' })
  @Get()
  async findAll() {
    return await this.service.findAll();
  }

  @ApiOperation({ summary: 'Get import by ID' })
  @Get(':id')
  async findOne(@Param('id', ParseIdPipe) id: ID) {
    return await this.service.findOne(id);
  }

  @Patch(':id/status')
  @AdminOnly()
  @ApiOperation({ summary: 'Receive or return an import transactionally' })
  changeStatus(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: ChangeImportStatusDto,
    @Req() request: AuthRequest,
  ) {
    const user: any = request.user;
    const doc = user?._doc || user;
    return this.service.changeStatus(
      String(id),
      dto,
      String(doc?.id || doc?._id || ''),
    );
  }
}
