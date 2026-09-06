import {
  Body,
  Get,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation } from '@nestjs/swagger';
import { WarehouseController } from '../decorators/warehouse';
import { AdminOnly } from '../decorators/admin-only';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';
import { DocumentSafetyService } from '../../../collection/document-safety/document-safety.service';
import {
  DocumentSafetyDateQueryDto,
  DocumentSafetyHistoryQueryDto,
  ReverseDocumentDayDto,
} from '../../../collection/document-safety/dtos/document-safety.dto';

@WarehouseController(['document-safety'])
@AdminOnly()
export class DocumentSafetyController {
  constructor(private readonly service: DocumentSafetyService) {}

  private actor(request: AuthRequest): any {
    const user: any = request.user;
    const doc = user?._doc || user;
    return {
      id: String(doc?.id || doc?._id || ''),
      role: doc?.role,
      name: doc?.fullName || doc?.name || doc?.username,
    };
  }

  @Get('preview')
  @ApiOperation({ summary: 'Preview all reversible documents for one day' })
  preview(@Query() query: DocumentSafetyDateQueryDto): Promise<any> {
    return this.service.preview(query);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Export invoices, debt payments and returns by day',
  })
  async export(
    @Query() query: DocumentSafetyDateQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.export(query);
    response.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="document-safety-${query.date}.xlsx"`,
    });
    return new StreamableFile(file);
  }

  @Get('operations')
  @ApiOperation({ summary: 'Get document day reversal history' })
  history(@Query() query: DocumentSafetyHistoryQueryDto): Promise<any> {
    return this.service.history(query);
  }

  @Post('reverse-day')
  @ApiOperation({ summary: 'Reverse all active documents created in one day' })
  reverseDay(
    @Body() dto: ReverseDocumentDayDto,
    @Req() request: AuthRequest,
  ): Promise<any> {
    return this.service.reverseDay(dto, this.actor(request));
  }
}
