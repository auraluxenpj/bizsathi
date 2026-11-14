export type CashClosingCsvRow = {
  date: string;
  branch: string;
  status: string;
  openedBy: string;
  closedBy: string;
  opening: string;
  receipts: string;
  refunds: string;
  cashIn: string;
  cashOut: string;
  expected: string;
  actual: string;
  difference: string;
};

const columns: { label: string; key: keyof CashClosingCsvRow; text?: boolean }[] = [
  { label: 'Date', key: 'date', text: true },
  { label: 'Branch', key: 'branch', text: true },
  { label: 'Status', key: 'status', text: true },
  { label: 'Opened by', key: 'openedBy', text: true },
  { label: 'Closed by', key: 'closedBy', text: true },
  { label: 'Opening cash (NPR)', key: 'opening' },
  { label: 'Cash sales / receipts (NPR)', key: 'receipts' },
  { label: 'Refunds paid (NPR)', key: 'refunds' },
  { label: 'Cash in (NPR)', key: 'cashIn' },
  { label: 'Cash out (NPR)', key: 'cashOut' },
  { label: 'Expected closing (NPR)', key: 'expected' },
  { label: 'Actual counted (NPR)', key: 'actual' },
  { label: 'Difference (NPR)', key: 'difference' },
];

function csvCell(value: string, text = false) {
  const safe = text && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Build a spreadsheet-safe export from the already-filtered daily cash sessions. */
export function buildCashClosingCsv(rows: CashClosingCsvRow[]) {
  const header = columns.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key], column.text)).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}
