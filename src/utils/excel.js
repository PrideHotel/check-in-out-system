// Excel (.xlsx) export shared by the History and Team Data screens.
//
// Each column is declared once as { header, width, value(record) }. `value`
// may return:
//   - a string or number      -> a text / number cell
//   - a Date                  -> a real Excel date (sortable, filterable)
//   - { link, text }          -> a clickable link, e.g. to Google Maps
//   - null / undefined / ''   -> an empty cell
//
// The writer library is loaded only when someone exports, so it adds nothing
// to the app's initial download.

/** How dates appear in the sheet; they stay real dates underneath. */
const DATE_FORMAT = 'dd-mm-yyyy hh:mm';

const HEADER_STYLE = {
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: '#71302D', // Pride maroon
  alignVertical: 'center',
};

const LINK_STYLE = {
  textColor: '#1D4ED8',
  textDecoration: { underline: true },
};

/**
 * Excel dates have no time zone: a cell just holds "10 Aug 2026, 14:35".
 * The writer converts a Date using its UTC time, which would show every
 * Indian time 5½ hours early, so shift it to the wall-clock time the app
 * itself shows (the viewer's local time) first.
 */
function toWallClock(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
}

/** Text for inside an Excel formula string: double any quotes. */
const formulaText = (text) => String(text).replace(/"/g, '""');

function toCell(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { type: Date, value: toWallClock(value), format: DATE_FORMAT };
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? { type: Number, value } : null;
  }

  if (typeof value === 'object' && value.link) {
    return {
      type: 'Formula',
      // No leading "=": the library writes this text into the file as-is, and
      // the .xlsx format stores formulas without one. (Its README example
      // shows one; with it, Excel offers to "repair" the file and drops links.)
      value: `HYPERLINK("${formulaText(value.link)}","${formulaText(value.text || value.link)}")`,
      ...LINK_STYLE,
    };
  }

  // Always a plain text cell: a company called "=SUM(...)" is shown as typed,
  // never run as a formula (a risk CSV files opened in Excel do have).
  return { type: String, value: String(value) };
}

/**
 * Builds the workbook and starts the download.
 *
 * @param {string} fileName  e.g. "team-visits-2026-11-01.xlsx"
 * @param {object} options
 * @param {string} options.sheet      sheet tab name (max 31 characters)
 * @param {Array}  options.columns    [{ header, width, value(record) }]
 * @param {Array}  options.records    the rows to export
 */
export async function downloadExcel(fileName, { sheet, columns, records }) {
  const { default: writeExcelFile } = await import('write-excel-file/browser');

  const header = columns.map((column) => ({ value: column.header, ...HEADER_STYLE }));
  const rows = records.map((record) => columns.map((column) => toCell(column.value(record))));

  await writeExcelFile([header, ...rows], {
    sheet: sheet.slice(0, 31),
    columns: columns.map((column) => ({ width: column.width ?? 16 })),
    stickyRowsCount: 1, // keep the header visible while scrolling
  }).toFile(fileName);
}

/** Date stamp used to keep exported filenames unique and sortable. */
export function exportStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
