import { Body, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { RoleEnum } from '../../../collection/users/interfaces/role.enum';
import {
  CreateQuickNoteDto,
  QuickNoteQueryDto,
  UpdateQuickNoteDto,
} from '../../../collection/quick-notes/dtos/quick-notes.dto';
import { QuickNotesService } from '../../../collection/quick-notes/quick-notes.service';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { AdminOnly } from '../decorators/admin-only';
import { WarehouseController } from '../decorators/warehouse';

@WarehouseController(['quick-notes'])
export class QuickNotesController {
  constructor(private readonly service: QuickNotesService) {}

  private actor(req: AuthRequest): { id: string; role: RoleEnum } {
    const user: any = req.user;
    const doc = user?._doc || user;
    return { id: String(doc?.id || doc?._id || ''), role: doc?.role };
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateQuickNoteDto, @Req() req: AuthRequest): Promise<any> {
    return this.service.create(dto, this.actor(req).id);
  }

  @Get()
  findAll(@Query() q: QuickNoteQueryDto, @Req() req: AuthRequest): Promise<any> {
    return this.service.findAll(q, this.actor(req));
  }

  @Get('latest-pinned')
  latestPinned(@Req() req: AuthRequest): Promise<any> {
    return this.service.latestPinned(this.actor(req));
  }

  @Get(':id')
  findOne(@Param('id', ParseIdPipe) id: ID, @Req() req: AuthRequest): Promise<any> {
    return this.service.findOne(String(id), this.actor(req));
  }

  @Patch(':id')
  @AdminOnly()
  update(
    @Param('id', ParseIdPipe) id: ID,
    @Body() dto: UpdateQuickNoteDto,
    @Req() req: AuthRequest,
  ): Promise<any> {
    return this.service.update(String(id), dto, this.actor(req).id);
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id', ParseIdPipe) id: ID, @Req() req: AuthRequest): Promise<any> {
    return this.service.remove(String(id), this.actor(req).id);
  }
}
