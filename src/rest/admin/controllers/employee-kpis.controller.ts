import { Body, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AdminController } from '../decorators/swagger';
import { EmployeeKpisService } from '../../../collection/employee-kpis/employee-kpis.service';
import { ChangeEmployeeKpiStatusDto, CreateEmployeeKpiDto, EmployeeKpiEvidenceQueryDto, EmployeeKpiQueryDto, LeaderboardQueryDto, UpdateEmployeeKpiDto } from '../../../collection/employee-kpis/dtos/employee-kpis.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface';

@AdminController(['employee-kpis'])
export class EmployeeKpisController {
  constructor(private readonly service: EmployeeKpisService) {}

  private actor(request: AuthRequest): string {
    return String((request.user as any)?.id || (request.user as any)?._id || '');
  }

  @Post()
  create(@Body() dto: CreateEmployeeKpiDto, @Req() request: AuthRequest): Promise<any> {
    return this.service.create(dto, this.actor(request));
  }

  @Get()
  list(@Query() query: EmployeeKpiQueryDto): Promise<any> {
    return this.service.findAll(query);
  }

  @Get('leaderboard')
  leaderboard(@Query() query: LeaderboardQueryDto): Promise<any> {
    return this.service.leaderboard(query);
  }

  @Get(':id/progress')
  progress(@Param('id') id: string): Promise<any> {
    return this.service.progress(id);
  }

  @Get(':id/evidence')
  evidence(@Param('id') id: string, @Query() query: EmployeeKpiEvidenceQueryDto): Promise<any> {
    return this.service.evidence(id, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<any> {
    return this.service.findOne(id);
  }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: ChangeEmployeeKpiStatusDto): Promise<any> {
    return this.service.update(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeKpiDto): Promise<any> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() request: AuthRequest): Promise<any> {
    return this.service.remove(id, this.actor(request));
  }
}
