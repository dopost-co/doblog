/** Provider spend from micro-USD: cents for normal amounts, a tenth of a cent for small ones. */
export function formatUsd(micros: number) {
  const value = micros / 1_000_000;
  return new Intl.NumberFormat("en", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 2, maximumFractionDigits: value > 0 && value < 1 ? 3 : 2,
  }).format(value);
}
