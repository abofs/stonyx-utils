export function getTimestamp(dateObject: Date | null = null): number {
  const ts = dateObject ? dateObject.getTime() : Date.now();

  return Math.floor(ts / 1000);
}
