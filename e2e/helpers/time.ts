export function localToUtc(
  date: string,
  time: string,
  tz: string = 'UTC',
): string {
  const iso = `${date}T${time}:00`;
  const ms = Date.parse(iso);
  if (isNaN(ms)) {
    const d = new Date(`${date}T${time}:00Z`);
    return d.toISOString();
  }
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: tz,
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(iso));
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '';
    const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    return new Date(localStr).toISOString();
  } catch {
    const d = new Date(iso);
    return d.toISOString();
  }
}

export function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

export function timeSlotAfter(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + hours * 60;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

export interface OpeningHours {
  open: string;
  close: string;
}

export function businessDate(
  date: string,
  openingHours: OpeningHours,
): string {
  const d = new Date(`${date}T${openingHours.open}:00`);
  return d.toISOString().slice(0, 10);
}
