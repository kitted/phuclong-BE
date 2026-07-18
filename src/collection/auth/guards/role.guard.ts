import { CanActivate, ExecutionContext, mixin, Type } from '@nestjs/common';
import { Jwt2faAuthGuard } from './jwt-2fa-auth.guard';
import { RoleEnum } from 'src/collection/users/interfaces/role.enum';

export const RolesGuard = (roles: RoleEnum[]): Type<CanActivate> => {
  class RoleGuardMixin extends Jwt2faAuthGuard {
    async canActivate(context: ExecutionContext) {
      await super.canActivate(context);
      const { user } = context.switchToHttp().getRequest();
      return roles.includes(user._doc.role);
    }
  }

  return mixin(RoleGuardMixin);
};
