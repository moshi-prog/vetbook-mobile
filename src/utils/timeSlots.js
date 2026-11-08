/**
 * timeSlots.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamically generate appointment time slots based on branch operating hours.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Generate 30-minute interval slots from opening hour up to 30 minutes before closing hour.
 *
 * @param {Object} branch Branch object containing operating hours
 * @param {string|Date} selectedDate The chosen booking or reschedule date
 * @returns {{ closed: boolean, slots: string[] }}
 */
export function generateTimeSlots(branch, selectedDate) {
  if (!selectedDate) {
    return { closed: false, slots: [] };
  }

  const dateObj =
    typeof selectedDate === 'string'
      ? new Date(selectedDate.includes('T') ? selectedDate : selectedDate + 'T00:00:00')
      : new Date(selectedDate);

  const day = dateObj.getDay(); // 0 is Sunday
  const isSunday = day === 0;

  if (isSunday && branch?.sunday_closed) {
    return { closed: true, slots: [] };
  }

  const openStr = isSunday
    ? (branch?.sunday_open || '10:00')
    : (branch?.weekday_open || '09:00');

  const closeStr = isSunday
    ? (branch?.sunday_close || '16:00')
    : (branch?.weekday_close || '18:00');

  if (!openStr || !closeStr) {
    return { closed: false, slots: [] };
  }

  const [openH, openM] = openStr.split(':').map(Number);
  const [closeH, closeM] = closeStr.split(':').map(Number);

  const startMinutes = openH * 60 + openM;
  const endMinutes = closeH * 60 + closeM;

  // Last appointment slot begins 30 minutes before clinic closing
  const lastSlotMinutes = endMinutes - 30;

  const slots = [];
  for (let m = startMinutes; m <= lastSlotMinutes; m += 30) {
    // Standard clinic lunch break: 12:00 PM to 1:00 PM (720 to 780 min)
    if (m >= 720 && m < 780) {
      continue;
    }
    const h = Math.floor(m / 60);
    const min = m % 60;
    const timeStr = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    slots.push(timeStr);
  }

  return {
    closed: slots.length === 0,
    slots,
  };
}

export default generateTimeSlots;

