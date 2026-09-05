import { vietnamDateBoundary } from '../trucks/truck-transfer-date';

const formatDate = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const vietnamParts = (anchor: Date | string = new Date()) => {
  if (typeof anchor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    const [year, month, day] = anchor.split('-').map(Number);
    return { year, month: month - 1, day };
  }
  const local = new Date(new Date(anchor).getTime() + 7 * 60 * 60 * 1000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
};

/** Chu kỳ KPI cố định: từ ngày 10 đến hết ngày 9 của tháng kế tiếp. */
export const monthlyKpiCycle = (anchor: Date | string = new Date()) => {
  const { year, month, day } = vietnamParts(anchor);
  const start = new Date(Date.UTC(year, day >= 10 ? month : month - 1, 10));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 9));
  const fromText = formatDate(start);
  const toText = formatDate(end);
  return { fromText, toText, from: vietnamDateBoundary(fromText, false), to: vietnamDateBoundary(toText, true) };
};
