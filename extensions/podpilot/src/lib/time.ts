const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatAge(timestamp: string | undefined): string {
  if (!timestamp) {
    return "-";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const diff = Date.now() - date.getTime();
  if (diff < MINUTE) {
    return `${Math.max(1, Math.floor(diff / SECOND))}s`;
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)}m`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)}h`;
  }

  return `${Math.floor(diff / DAY)}d`;
}

export function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) {
    return "-";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}
