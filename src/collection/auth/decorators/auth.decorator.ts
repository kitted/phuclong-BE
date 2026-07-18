import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthRequest } from '../interfaces/authRequest.interface';

export const Auth = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request: AuthRequest = ctx.switchToHttp().getRequest();
    if (request?.user?._doc) {
      return {
        id: request?.user?._doc?._id?.toString(),
        role: request?.user?._doc?.role,
      };
    }
    return request.user;
  },
);
