/**
 * 100-year Global Warming Potentials (GWP-100) used to convert CH4 and N2O into CO2-equivalent.
 * Values as listed in the GHG Protocol "Global Warming Potential Values" table (IPCC AR5 and AR6).
 *
 *  - AR5 (2014), without climate-carbon feedbacks: CH4 = 28, N2O = 265
 *  - AR6 (2021): CH4 from fossil sources = 29.8 (non-fossil / biogenic = 27.0), N2O = 273
 *
 * Fuel combustion is fossil, so the fossil CH4 value is used for AR6. CO2 is 1 by definition.
 */
export type GwpSetName = 'AR5' | 'AR6';

export const GWP: Record<GwpSetName, { co2: number; ch4: number; n2o: number; label: string }> = {
  AR5: { co2: 1, ch4: 28, n2o: 265, label: 'IPCC Fifth Assessment Report (AR5), 100-year GWP' },
  AR6: { co2: 1, ch4: 29.8, n2o: 273, label: 'IPCC Sixth Assessment Report (AR6), 100-year GWP (fossil CH4)' },
};

export interface GasSplit {
  co2Kg: number;
  ch4Kg: number;
  n2oKg: number;
}

/** CO2e (kg) of a gas split with the chosen GWP set. */
export function co2eFromGases(gases: GasSplit, set: GwpSetName): number {
  const g = GWP[set];
  return gases.co2Kg * g.co2 + gases.ch4Kg * g.ch4 + gases.n2oKg * g.n2o;
}
