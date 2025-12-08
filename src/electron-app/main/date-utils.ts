/**
 * Date parsing utilities for handling both string dates and Excel serial numbers
 */

/**
 * Parse a date input that could be:
 * - Excel serial number (e.g., 45714.714583333334)
 * - String date in various formats (e.g., "10/8/2025", "2025-10-08")
 * - Date object
 *
 * Returns ISO 8601 date string (YYYY-MM-DD)
 */
export function parseDate(dateInput: string | number | Date): string {
  if (!dateInput) return '';

  try {
    // Handle Date object
    if (dateInput instanceof Date) {
      return dateInput.toISOString().split('T')[0];
    }

    // Handle Excel serial date number (e.g., 45714.714583333334)
    if (typeof dateInput === 'number') {
      return excelSerialToDate(dateInput);
    }

    // Handle string dates
    const dateStr = String(dateInput).trim();

    // Try parsing as-is (handles ISO format and many other formats)
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    // Fallback: return as-is
    return dateStr;
  } catch (e) {
    console.error('Error parsing date:', dateInput, e);
    return String(dateInput);
  }
}

/**
 * Parse a datetime input that could be:
 * - Excel serial number with time (e.g., 45714.714583333334)
 * - String datetime (e.g., "10/8/2025 20:27")
 * - Date object
 *
 * Returns ISO 8601 datetime string with timezone (e.g., "2025-10-08T20:27:00.000Z")
 */
export function parseDateTime(dateInput: string | number | Date): string {
  if (!dateInput) return '';

  try {
    // Handle Date object
    if (dateInput instanceof Date) {
      return dateInput.toISOString();
    }

    // Handle Excel serial date number (e.g., 45714.714583333334)
    if (typeof dateInput === 'number') {
      return excelSerialToISO(dateInput);
    }

    // Handle string datetime
    const dateStr = String(dateInput).trim();

    // Try parsing as-is first
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    // Try parsing M/D/YYYY H:mm format (common in exports)
    const parts = dateStr.split(' ');
    if (parts.length === 2) {
      const datePart = parts[0];
      const timePart = parts[1];

      const dateParts = datePart.split('/');
      const timeParts = timePart.split(':');

      if (dateParts.length === 3 && timeParts.length >= 2) {
        const month = parseInt(dateParts[0]);
        const day = parseInt(dateParts[1]);
        const year = parseInt(dateParts[2]);
        const hour = parseInt(timeParts[0]);
        const minute = parseInt(timeParts[1]);
        const second = timeParts[2] ? parseInt(timeParts[2]) : 0;

        const date = new Date(year, month - 1, day, hour, minute, second);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
    }

    // Fallback: return as-is
    return dateStr;
  } catch (e) {
    console.error('Error parsing datetime:', dateInput, e);
    return String(dateInput);
  }
}

/**
 * Convert Excel serial number to ISO date string (date only, no time)
 * Excel serial dates are days since December 30, 1899
 * Example: 45714 -> "2025-03-11"
 */
function excelSerialToDate(serial: number): string {
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const days = Math.floor(serial);
  const date = new Date(excelEpoch.getTime() + days * 86400000);
  return date.toISOString().split('T')[0];
}

/**
 * Convert Excel serial number to full ISO datetime string
 * The decimal part represents the time fraction of the day
 * Example: 45714.714583333334 -> "2025-03-11T17:09:00.000Z"
 */
function excelSerialToISO(serial: number): string {
  const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
  const days = Math.floor(serial);
  const timeFraction = serial - days;

  const date = new Date(excelEpoch.getTime() + days * 86400000);
  date.setTime(date.getTime() + timeFraction * 86400000);

  return date.toISOString();
}

/**
 * Format M/D/YYYY string to YYYY-MM-DD
 * Example: "3/11/2025" -> "2025-03-11"
 */
export function formatSlashDate(dateStr: string): string {
  if (!dateStr) return '';

  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }

  return dateStr;
}
