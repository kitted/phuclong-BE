import { Body, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { WarehouseController } from '../decorators/warehouse'; import { AdminOnly } from '../decorators/admin-only';
import { EmployeeKpisService } from '../../../collection/employee-kpis/employee-kpis.service';
import { ChangeEmployeeKpiStatusDto, CreateEmployeeKpiDto, EmployeeKpiEvidenceQueryDto, EmployeeKpiQueryDto, LeaderboardQueryDto, UpdateEmployeeKpiDto } from '../../../collection/employee-kpis/dtos/employee-kpis.dto';
import { AuthRequest } from '../../../collection/auth/interfaces/authRequest.interface'; import { RoleEnum } from '../../../collection/users/interfaces/role.enum';
@WarehouseController(['employee-kpis'])
export class EmployeeKpisController {
  constructor(private readonly service: EmployeeKpisService) {}
  private actor(request: AuthRequest) { const user: any = request.user; const doc = user?._doc || user; return { id: String(doc?.id || doc?._id || ''), role: doc?.role }; }
  private employeeScope(request: AuthRequest) { const actor = this.actor(request); return actor.role === RoleEnum.STAFF ? actor.id : undefined; }
  @Post() @AdminOnly() create(@Body() dto: CreateEmployeeKpiDto, @Req() request: AuthRequest): Promise<any> { return this.service.create(dto, this.actor(request).id); }
  @Get() list(@Query() query: EmployeeKpiQueryDto, @Req() request: AuthRequest): Promise<any> { const employeeId = this.employeeScope(request); return this.service.findAll(employeeId ? { ...query, employeeId } : query); }
  @Get('leaderboard') @AdminOnly() leaderboard(@Query() query: LeaderboardQueryDto): Promise<any> { return this.service.leaderboard(query); }
  @Get(':id/progress') progress(@Param('id') id: string, @Req() request: AuthRequest): Promise<any> { return this.service.progress(id, this.employeeScope(request)); }
  @Get(':id/evidence') evidence(@Param('id') id: string, @Query() query: EmployeeKpiEvidenceQueryDto, @Req() request: AuthRequest): Promise<any> { return this.service.evidence(id, query, this.employeeScope(request)); }
  @Get(':id') findOne(@Param('id') id: string, @Req() request: AuthRequest): Promise<any> { return this.service.findOne(id, this.employeeScope(request)); }
  @Patch(':id/status') @AdminOnly() status(@Param('id') id: string, @Body() dto: ChangeEmployeeKpiStatusDto): Promise<any> { return this.service.update(id, dto); }
  @Patch(':id') @AdminOnly() update(@Param('id') id: string, @Body() dto: UpdateEmployeeKpiDto): Promise<any> { return this.service.update(id, dto); }
  @Delete(':id') @AdminOnly() remove(@Param('id') id: string, @Req() request: AuthRequest): Promise<any> { return this.service.remove(id, this.actor(request).id); }
}
