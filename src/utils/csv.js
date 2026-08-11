// CSV helpers shared by the history and admin screens.

function escapeCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** Build a CSV document from a header row and an array of row arrays. */
export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/**
 * Trigger a download of the given rows as a CSV file.
 * A UTF-8 BOM is prepended so Excel opens accented characters correctly.
 */
export function downloadCsv(filename, headers, rows) {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + toCsv(headers, rows)], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Date stamp used to keep exported filenames unique and sortable. */
export function exportStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
