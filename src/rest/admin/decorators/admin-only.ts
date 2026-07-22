import { applyDecorators, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../../../collection/auth/guards/role.guard';
import { RoleEnum } from '../../../collection/users/interfaces/role.enum';
export function AdminOnly() { return applyDecorators(UseGuards(RolesGuard([RoleEnum.ADMIN]))); }
