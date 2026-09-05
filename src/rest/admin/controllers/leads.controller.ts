import { BadRequestException, Body, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { WarehouseController } from '../decorators/warehouse';
import { AdminOnly } from '../decorators/admin-only';
import { ParseIdPipe } from '../../../core/pipes/parseId.pipe';
import { ID } from '../../../core/interfaces/id.interface';
import { LeadsService } from '../../../collection/leads/leads.service';
import { CreateLeadDto, CreateLeadInteractionDto, LeadQueryDto, UpdateLeadDto } from '../../../collection/leads/dtos/leads.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
@WarehouseController(['leads'])
export class LeadsController {
  constructor(private readonly service: LeadsService) {}
  private actor(req: AuthRequest): any { const value: any = (req.user as any)?._doc || req.user || {}; return { id: String(value.id || value._id || ''), name: value.fullName || value.name }; }
  @Get() list(@Query() q: LeadQueryDto) { return this.service.list(q); }
  @Get(':id') detail(@Param('id', ParseIdPipe) id: ID) { return this.service.findOne(String(id)); }
  @Post() @AdminOnly() create(@Body() dto: CreateLeadDto) { return this.service.create(dto); }
  @Patch(':id') @AdminOnly() update(@Param('id', ParseIdPipe) id: ID, @Body() dto: UpdateLeadDto) { return this.service.update(String(id), dto); }
  @Delete(':id') @AdminOnly() remove(@Param('id', ParseIdPipe) id: ID) { return this.service.remove(String(id)); }
  @Post(':id/image') @AdminOnly() @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => { if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return callback(new BadRequestException('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP'), false); callback(null, true); } })) uploadImage(@Param('id', ParseIdPipe) id: ID, @UploadedFile() file: any) { return this.service.uploadImage(String(id), file); }
  @Post(':id/interactions') interact(@Param('id', ParseIdPipe) id: ID, @Body() dto: CreateLeadInteractionDto, @Req() req: AuthRequest) { return this.service.interact(String(id), dto, this.actor(req)); }
}
