import { ApiTags } from '@nestjs/swagger';
import { applyDecorators, Controller } from '@nestjs/common';

export function PublicApiTags(tags: string[]) {
  tags = tags.map((t) => `Public: ${t.toUpperCase()}`);

  return ApiTags(...tags);
}

export function PublicController(tags: string[]) {
  const decorators = [PublicApiTags(tags), Controller(tags)];

  return applyDecorators(...decorators);
}
