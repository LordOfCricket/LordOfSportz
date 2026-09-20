const GROUND_TIMEZONE = 'Asia/Kolkata'

/**
 * Ground-local (Asia/Kolkata) calendar date for any Date/instant — matches
 * the backend's own groundDateStr()/groundTodayDateStr(), which every
 * date-scoped booking endpoint validates against. A device-local calendar
 * date (Date#toISOString / Date#setHours + toISOString) drifts from this
 * whenever the device's timezone differs from IST, which silently sends the
 * wrong day to the API.
 */
export function toGroundDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: GROUND_TIMEZONE }).format(date)
}

export function groundTodayDateStr(): string {
  return toGroundDateStr(new Date())
}

/**
 * Ground-local (Asia/Kolkata) hour-of-day 0–23 for an instant. Used to send
 * a staff block's `hour` aligned to the backend's ground-local slot grid,
 * regardless of the device timezone.
 */
export function toGroundHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: GROUND_TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(date),
  )
}

export function addGroundDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return next.toISOString().slice(0, 10)
}
