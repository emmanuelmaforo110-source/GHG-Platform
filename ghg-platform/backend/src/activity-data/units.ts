import { BadRequestException } from '@nestjs/common';

/**
 * Unit conversion for activity data (Phase 0 of the roadmap).
 *
 * Why this exists: emissions = quantity x factor only works when the quantity is expressed in the
 * factor's own denominator unit. Before this module, a user entering "5 MWh" against a factor in
 * "kg CO2e / kWh" silently got a result 1,000x too small. Now every quantity is converted to the
 * factor's unit before calculating, and incompatible units (e.g. litres against a per-kWh factor)
 * are rejected with a clear error instead of producing a wrong number.
 */

type Dimension = 'volume' | 'energy' | 'mass' | 'distance' | 'passenger_distance' | 'room_night';

interface UnitDef {
  dimension: Dimension;
  /** How many of the dimension's base unit one of this unit equals. */
  toBase: number;
}

// Base units: litre, kWh, kg, km, passenger-km, room-night.
const UNITS: Record<string, UnitDef> = {
  // Volume
  l: { dimension: 'volume', toBase: 1 },
  litre: { dimension: 'volume', toBase: 1 },
  liter: { dimension: 'volume', toBase: 1 },
  ml: { dimension: 'volume', toBase: 0.001 },
  m3: { dimension: 'volume', toBase: 1000 },
  'cubic metre': { dimension: 'volume', toBase: 1000 },
  'cubic meter': { dimension: 'volume', toBase: 1000 },
  gallon: { dimension: 'volume', toBase: 3.785411784 }, // US gallon
  'us gallon': { dimension: 'volume', toBase: 3.785411784 },
  'imperial gallon': { dimension: 'volume', toBase: 4.54609 },
  'uk gallon': { dimension: 'volume', toBase: 4.54609 },

  // Energy
  wh: { dimension: 'energy', toBase: 0.001 },
  kwh: { dimension: 'energy', toBase: 1 },
  mwh: { dimension: 'energy', toBase: 1000 },
  gwh: { dimension: 'energy', toBase: 1_000_000 },
  mj: { dimension: 'energy', toBase: 1 / 3.6 },
  gj: { dimension: 'energy', toBase: 1000 / 3.6 },

  // Mass
  g: { dimension: 'mass', toBase: 0.001 },
  gram: { dimension: 'mass', toBase: 0.001 },
  kg: { dimension: 'mass', toBase: 1 },
  kilogram: { dimension: 'mass', toBase: 1 },
  t: { dimension: 'mass', toBase: 1000 },
  tonne: { dimension: 'mass', toBase: 1000 },
  'metric ton': { dimension: 'mass', toBase: 1000 },
  lb: { dimension: 'mass', toBase: 0.45359237 },
  pound: { dimension: 'mass', toBase: 0.45359237 },
  'kg waste': { dimension: 'mass', toBase: 1 },

  // Distance
  m: { dimension: 'distance', toBase: 0.001 },
  metre: { dimension: 'distance', toBase: 0.001 },
  km: { dimension: 'distance', toBase: 1 },
  kilometre: { dimension: 'distance', toBase: 1 },
  kilometer: { dimension: 'distance', toBase: 1 },
  mile: { dimension: 'distance', toBase: 1.609344 },
  mi: { dimension: 'distance', toBase: 1.609344 },

  // Passenger distance (air travel)
  'passenger-km': { dimension: 'passenger_distance', toBase: 1 },
  'passenger km': { dimension: 'passenger_distance', toBase: 1 },
  pkm: { dimension: 'passenger_distance', toBase: 1 },
  'passenger-mile': { dimension: 'passenger_distance', toBase: 1.609344 },

  // Hotel stays
  'room-night': { dimension: 'room_night', toBase: 1 },
  'room night': { dimension: 'room_night', toBase: 1 },
  night: { dimension: 'room_night', toBase: 1 },
};

/** Lower-cases, trims, and turns plurals / "(lost)" style suffixes into a lookup key. */
export function normalizeUnit(raw: string): string {
  let u = (raw ?? '').toLowerCase().trim();
  u = u.replace(/\(.*?\)/g, '').trim(); // "kWh (lost)" -> "kwh"
  u = u.replace(/\s+/g, ' ');
  u = u.replace(/³/g, '3');
  if (UNITS[u]) return u;
  // Plurals: litres, gallons, tonnes, kilometres, miles, nights, room-nights, kgs
  const singular = u.replace(/(es|s)$/, '');
  if (UNITS[singular]) return singular;
  const singularS = u.replace(/s$/, '');
  if (UNITS[singularS]) return singularS;
  return u;
}

/**
 * Extracts the denominator from an emission-factor unit string, e.g.
 * "kg CO2e / litre" -> "litre", "kg CO2e / passenger-km" -> "passenger-km".
 * Returns null when the unit has no "/" (e.g. the T&D loss-rate factor, which is a percentage).
 */
export function factorDenominator(factorUnit: string): string | null {
  const idx = (factorUnit ?? '').lastIndexOf('/');
  if (idx === -1) return null;
  return factorUnit.slice(idx + 1).trim();
}

export function isKnownUnit(raw: string): boolean {
  return !!UNITS[normalizeUnit(raw)];
}

/**
 * Converts `quantity` expressed in `fromUnit` into `toUnit`.
 * - Same unit (after normalising) -> returned unchanged.
 * - Both known and same dimension -> converted.
 * - Otherwise -> BadRequestException explaining the mismatch.
 */
export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;

  const fromDef = UNITS[from];
  const toDef = UNITS[to];
  if (!fromDef || !toDef) {
    throw new BadRequestException(
      `Unit "${fromUnit}" cannot be converted to "${toUnit}". Enter the quantity in ${toUnit}, or use a supported unit.`,
    );
  }
  if (fromDef.dimension !== toDef.dimension) {
    throw new BadRequestException(
      `Unit "${fromUnit}" does not match the emission factor, which is per ${toUnit}. Check the unit or choose a different emission factor.`,
    );
  }
  return (quantity * fromDef.toBase) / toDef.toBase;
}

/**
 * Converts an activity quantity into the denominator unit of the emission factor it will be
 * multiplied by. Factors without a denominator (percentages) are returned unchanged.
 */
export function toFactorUnit(quantity: number, activityUnit: string, factorUnit: string): number {
  const denom = factorDenominator(factorUnit);
  if (!denom) return quantity;
  return convertQuantity(quantity, activityUnit, denom);
}
