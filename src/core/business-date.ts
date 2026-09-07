import { BadRequestException } from '@nestjs/common';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function vietnamDateKey(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Parse a user-selected business date in Asia/Ho_Chi_Minh.
 * A date-only value represents local midnight, never UTC midnight and never
 * the server's current date/time. Timestamps on the current business day keep
 * their exact instant; other selected days are normalized to local midnight.
 */
export function parseBusinessDate(
  value: string | Date | undefined,
  fieldLabel = 'Ngày chứng từ',
  fallback = new Date(),
  referenceNow = new Date(),
): Date {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = value instanceof Date ? value : String(value).trim();
  const date =
    typeof raw === 'string' && DATE_ONLY.test(raw)
      ? new Date(`${raw}T00:00:00.000+07:00`)
      : new Date(raw);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`${fieldLabel} không hợp lệ`);
  const selectedDay = vietnamDateKey(date);
  if (selectedDay !== vietnamDateKey(referenceNow))
    return new Date(`${selectedDay}T00:00:00.000+07:00`);
  return date;
}
