import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import { RoleEnum } from 'src/collection/users/interfaces/role.enum';
import { RolesGuard } from 'src/collection/auth/guards/role.guard';

export function AdminApiTags(tags: string[]) {
  tags = tags.map((t) => `Admin: ${t.toUpperCase()}`);

  return ApiTags(...tags);
}

export function AdminController(
  tags: string[],
  options?: {
    enabledGuards?: boolean;
    needSwaggerAuth?: boolean;
    hidden?: boolean;
  },
) {
  const {
    enabledGuards = true,
    needSwaggerAuth = true,
    hidden = false,
  } = options || {};

  const decorators = [AdminApiTags(tags), Controller(tags)];

  if (hidden) {
    decorators.push(ApiExcludeController());
  }

  if (needSwaggerAuth) {
    decorators.push(ApiBearerAuth());
  }

  if (enabledGuards) {
    decorators.push(UseGuards(RolesGuard([RoleEnum.ADMIN])));
  }

  return applyDecorators(...decorators);
}
