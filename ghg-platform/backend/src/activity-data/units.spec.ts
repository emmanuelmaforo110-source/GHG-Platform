import { BadRequestException } from '@nestjs/common';
import { convertQuantity, factorDenominator, normalizeUnit, toFactorUnit } from './units';

describe('units', () => {
  it('normalises case, plurals and suffixes', () => {
    expect(normalizeUnit('Litres')).toBe('litre');
    expect(normalizeUnit('kWh (lost)')).toBe('kwh');
    expect(normalizeUnit(' Tonnes ')).toBe('tonne');
    expect(normalizeUnit('room-nights')).toBe('room-night');
    expect(normalizeUnit('passenger-km')).toBe('passenger-km');
  });

  it('reads the denominator of a factor unit', () => {
    expect(factorDenominator('kg CO2e / litre')).toBe('litre');
    expect(factorDenominator('kg CO2e / passenger-km')).toBe('passenger-km');
    expect(factorDenominator('% (as decimal) of kWh delivered')).toBeNull();
  });

  it('leaves identical units unchanged', () => {
    expect(convertQuantity(1000, 'litres', 'litre')).toBe(1000);
    expect(convertQuantity(18000, 'kWh', 'kWh')).toBe(18000);
  });

  it('converts within a dimension', () => {
    expect(convertQuantity(18, 'MWh', 'kWh')).toBeCloseTo(18000, 6);
    expect(convertQuantity(100, 'gallons', 'litre')).toBeCloseTo(378.5411784, 6);
    expect(convertQuantity(2, 'tonnes', 'kg')).toBeCloseTo(2000, 6);
    expect(convertQuantity(10, 'miles', 'km')).toBeCloseTo(16.09344, 6);
    expect(convertQuantity(3.6, 'GJ', 'kWh')).toBeCloseTo(1000, 6);
  });

  it('rejects units from different dimensions', () => {
    expect(() => convertQuantity(1000, 'litres', 'kWh')).toThrow(BadRequestException);
  });

  it('rejects unknown units that differ from the factor unit', () => {
    expect(() => convertQuantity(5, 'bags', 'kg')).toThrow(BadRequestException);
  });

  it('converts to the factor unit, and passes through percentage factors', () => {
    expect(toFactorUnit(18, 'MWh', 'kg CO2e / kWh')).toBeCloseTo(18000, 6);
    expect(toFactorUnit(0.5, 'anything', '% (as decimal) of kWh delivered')).toBe(0.5);
  });
});
