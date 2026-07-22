import { BadRequestException } from '@nestjs/common';

export function vietnamDateBoundary(value: string, endOfDay: boolean) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+07:00` : value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Khoảng ngày không hợp lệ');
  return parsed;
}
