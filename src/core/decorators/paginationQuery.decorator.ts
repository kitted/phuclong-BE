import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export const ApiPaginateQuery = () => {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'limit', required: false, example: 10 }),
    ApiQuery({ name: 'sortBy', required: false, example: 'createdAt' }),
    ApiQuery({ name: 'sortType', required: false, example: 'desc' }),
    ApiQuery({ name: 'searchBy', required: false, example: '123' }),
  );
};
