export function getTimestamp(dateObject=null) {
  const ts = dateObject ? dateObject.getTime() : Date.now();

  return Math.floor(ts / 1000);
}
