export function isFlagEnabled(value) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized.length === 0) {
    return false;
  }

  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}


