export function menuMonthDays(year: number, monthIndex: number, startDay = 1): string[] {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const days: string[] = [];
  for (let day = startDay; day <= lastDay; day += 1) {
    days.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return days;
}

export function menuDateLabel(dateKey: string): string {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateKey);
  if (!match) return dateKey;
  const [year, monthNumber, day] = dateKey.split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
    .format(new Date(year, monthNumber - 1, day));
  const month = new Intl.DateTimeFormat('fr-FR', { month: 'long' })
    .format(new Date(year, monthNumber - 1, day));
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} ${month}`;
}

export function localDateKey(date = new Date(), year?: number, monthIndex?: number): string {
  const y = year ?? date.getFullYear();
  const m = monthIndex ?? date.getMonth();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
