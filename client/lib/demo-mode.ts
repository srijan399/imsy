export const DEMO_DATA_ENV = "NEXT_PUBLIC_IMSY_DEMO_DATA"

const DISABLED_VALUES = new Set(["0", "false", "off", "no"])

export function isDemoDataEnabled() {
  const value = process.env.NEXT_PUBLIC_IMSY_DEMO_DATA
  if (value === undefined || value.trim() === "") return true
  return !DISABLED_VALUES.has(value.trim().toLowerCase())
}
