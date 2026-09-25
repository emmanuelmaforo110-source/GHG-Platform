import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { normalizeHeader, parseCsv, toCsv } from '../common/csv';
import { ActivityDataService } from './activity-data.service';
import { CalculationEngineService } from './calculation-engine.service';
import { CreateActivityDataDto } from './dto/create-activity-data.dto';

/** Columns of the import template, in order. Only category, source_name, quantity and unit are required. */
export const IMPORT_COLUMNS = [
  'facility',
  'category',
  'source_name',
  'fuel_or_material_type',
  'quantity',
  'unit',
  'emission_factor',
  'market_emission_factor',
  'data_quality',
  'detail',
  'notes',
  'method',
] as const;

const MAX_ROWS = 1000;

export interface ImportRowResult {
  line: number; // line number in the file (header = line 1)
  ok: boolean;
  errors: string[];
  sourceName?: string;
  category?: string;
  facility?: string;
  quantity?: number;
  unit?: string;
  emissionFactor?: string;
  emissionsTco2e?: number;
  marketEmissionsTco2e?: number | null;
}

export interface ImportResult {
  committed: boolean;
  created: number;
  summary: { rows: number; valid: number; invalid: number; totalTco2e: number };
  rows: ImportRowResult[];
}

/**
 * Bulk import of activity data from a CSV file (e.g. saved from Excel with "Save as → CSV"),
 * and CSV export of a reporting period's entries.
 *
 * Import is two-step: a preview checks and calculates every row without saving anything; the
 * commit saves the rows only if every row is valid, so a file is never half-imported by mistake.
 */
@Injectable()
export class ImportExportService {
  constructor(
    private prisma: PrismaService,
    private activityData: ActivityDataService,
    private calc: CalculationEngineService,
  ) {}

  templateCsv(): string {
    return toCsv([
      [...IMPORT_COLUMNS],
      ['Dar es Salaam Office', 'Stationary Combustion', 'Backup generator', 'Diesel', 1000, 'litres', '', '', 2, 'Fuel receipts Jan-Dec', '', ''],
      ['Dar es Salaam Office', 'Purchased Electricity', 'Office electricity', '', 18000, 'kWh', 'Tanzania grid electricity', '', 1, 'TANESCO bills', '', ''],
      ['Dar es Salaam Office', 'Category 6 — Business Travel', 'Hotel nights', '', 15, 'room-nights', 'Hotel stay', '', 3, '', '', ''],
      // Supplier-reported emissions: quantity in kg or t CO2e, method = supplier
      ['Dar es Salaam Office', 'Category 1 — Purchased Goods & Services', 'Printing supplier (reported)', '', 0.4, 't CO2e', '', '', 2, 'Supplier carbon statement', '', 'supplier'],
    ]);
  }

  /** Picks one item by name: exact (case-insensitive) first, then a single partial match. */
  private pickByName<T>(items: T[], text: string, name: (t: T) => string, label: string): T {
    const q = text.trim().toLowerCase();
    const exact = items.filter((i) => name(i).trim().toLowerCase() === q);
    if (exact.length === 1) return exact[0];
    const partial = items.filter((i) => name(i).toLowerCase().includes(q));
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      throw new BadRequestException(`${label} "${text}" matches several: ${partial.map(name).join('; ')}.`);
    }
    throw new BadRequestException(`${label} "${text}" was not found.`);
  }

  async importCsv(user: AuthenticatedUser, reportingPeriodId: string, csvText: string, commit: boolean): Promise<ImportResult> {
    if (!reportingPeriodId) throw new BadRequestException('Choose a reporting period for the import.');
    const period = await this.activityData.getEditablePeriod(user, reportingPeriodId);

    const table = parseCsv(csvText ?? '');
    if (table.length < 2) throw new BadRequestException('The file has no data rows. Use the template and fill in one row per entry.');
    if (table.length - 1 > MAX_ROWS) throw new BadRequestException(`A single import can hold at most ${MAX_ROWS} rows.`);

    const header = table[0].map(normalizeHeader);
    for (const required of ['category', 'source_name', 'quantity', 'unit']) {
      if (!header.includes(required)) {
        throw new BadRequestException(`The file is missing the "${required}" column. Download the template to see the expected columns.`);
      }
    }
    const col = (row: string[], name: string) => {
      const i = header.indexOf(name);
      return i === -1 ? '' : (row[i] ?? '').trim();
    };

    const facilities = await this.prisma.facility.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        ...(user.restrictedFacilityId ? { id: user.restrictedFacilityId } : {}),
      },
    });
    const categories = await this.prisma.ghgCategory.findMany();

    const results: ImportRowResult[] = [];
    const validDtos: CreateActivityDataDto[] = [];

    for (let r = 1; r < table.length; r++) {
      const row = table[r];
      const result: ImportRowResult = { line: r + 1, ok: false, errors: [] };
      results.push(result);
      const fail = (msg: string) => result.errors.push(msg);

      try {
        // Facility — may be left blank when the user can only use one facility.
        const facilityText = col(row, 'facility');
        let facility = facilities.length === 1 && !facilityText ? facilities[0] : undefined;
        if (!facility) {
          if (!facilityText) throw new BadRequestException('Enter the facility name.');
          facility = this.pickByName(facilities, facilityText, (f) => f.name, 'Facility');
        }
        result.facility = facility.name;

        const categoryText = col(row, 'category');
        if (!categoryText) throw new BadRequestException('Enter the category.');
        const category = this.pickByName(categories, categoryText, (c) => c.name, 'Category');
        result.category = category.name;

        const sourceName = col(row, 'source_name');
        if (!sourceName) fail('Enter the source name.');
        result.sourceName = sourceName;

        const quantity = Number(col(row, 'quantity').replace(/[\s,]/g, ''));
        if (!col(row, 'quantity') || !Number.isFinite(quantity) || quantity <= 0) fail('Quantity must be a number greater than zero.');
        result.quantity = quantity;

        const unit = col(row, 'unit');
        if (!unit) fail('Enter the unit.');
        result.unit = unit;

        const qualityText = col(row, 'data_quality');
        const dataQualityScore = qualityText ? Number(qualityText) : null;
        if (qualityText && !(Number.isInteger(dataQualityScore) && dataQualityScore! >= 1 && dataQualityScore! <= 5)) {
          fail('Data quality must be a whole number from 1 (best) to 5 (weakest), or left blank.');
        }
        const methodText = col(row, 'method').toLowerCase();
        let calculationMethod: 'supplier_specific' | undefined;
        if (methodText.startsWith('supplier')) calculationMethod = 'supplier_specific';
        else if (methodText && !['activity', 'activity_based', 'spend', 'spend_based', 'auto'].includes(methodText)) {
          fail('Method must be blank, "activity", "spend" or "supplier".');
        }
        if (result.errors.length) continue;

        const factorsInCategory = await this.prisma.emissionFactor.findMany({
          where: {
            categoryId: category.id,
            validYear: { lte: period.year },
            OR: [{ organizationId: null }, { organizationId: user.organizationId }],
          },
          orderBy: { validYear: 'desc' },
        });
        // Prefer the newest year's factors when a name appears in several years.
        const newestFirst = (name: string) => {
          const matches = factorsInCategory.filter((f) => f.factorName.trim().toLowerCase() === name.trim().toLowerCase());
          return matches.length ? [matches[0]] : factorsInCategory;
        };
        const pickFactor = (text: string, label: string) =>
          this.pickByName(newestFirst(text), text, (f) => f.factorName, label);

        const factorText = col(row, 'emission_factor');
        const marketText = col(row, 'market_emission_factor');
        const emissionFactorId = factorText ? pickFactor(factorText, 'Emission factor').id : undefined;
        const marketEmissionFactorId = marketText ? pickFactor(marketText, 'Market-based emission factor').id : undefined;

        const dto: CreateActivityDataDto = {
          facilityId: facility.id,
          reportingPeriodId: period.id,
          categoryId: category.id,
          sourceName,
          fuelOrMaterialType: col(row, 'fuel_or_material_type') || undefined,
          quantity,
          unit,
          emissionFactorId,
          marketEmissionFactorId,
          dataQualityScore,
          calculationMethod,
          detail: col(row, 'detail') || undefined,
          notes: col(row, 'notes') || undefined,
        };

        const prepared = await this.activityData.prepare(user, period, dto);
        result.emissionFactor = prepared.factor?.factorName ?? 'Supplier-reported emissions';
        result.emissionsTco2e = round(prepared.emissionsKg / 1000);
        result.marketEmissionsTco2e = prepared.market ? round(prepared.market.emissionsKg / 1000) : null;
        result.ok = true;
        validDtos.push(dto);
      } catch (err: any) {
        fail(err?.message ?? 'This row could not be read.');
      }
    }

    const valid = results.filter((r) => r.ok);
    const summary = {
      rows: results.length,
      valid: valid.length,
      invalid: results.length - valid.length,
      totalTco2e: round(valid.reduce((s, r) => s + (r.emissionsTco2e ?? 0), 0)),
    };

    if (!commit || summary.invalid > 0) {
      return { committed: false, created: 0, summary, rows: results };
    }

    let created = 0;
    for (const dto of validDtos) {
      await this.activityData.create(user, dto, null);
      created++;
    }
    return { committed: true, created, summary, rows: results };
  }

  async exportCsv(user: AuthenticatedUser, reportingPeriodId: string): Promise<{ filename: string; csv: string }> {
    const period = await this.prisma.reportingPeriod.findFirst({
      where: { id: reportingPeriodId, organizationId: user.organizationId },
    });
    if (!period) throw new NotFoundException('Reporting period not found.');

    const rows = await this.prisma.activityData.findMany({
      where: {
        organizationId: user.organizationId,
        reportingPeriodId,
        ...(user.restrictedFacilityId ? { facilityId: user.restrictedFacilityId } : {}),
      },
      include: { category: true, facility: true },
      orderBy: [{ categoryId: 'asc' }, { enteredAt: 'asc' }],
    });

    const scopeLabel = (s: string) => s.replace('scope_', 'Scope ');
    const csv = toCsv([
      [
        'row_id', 'facility', 'scope', 'category', 'source_name', 'detail', 'fuel_or_material_type', 'quantity', 'unit',
        'emission_factor_value', 'emission_factor_unit', 'emission_factor_source', 'emissions_kgco2e', 'emissions_tco2e',
        'market_factor_value', 'market_factor_source', 'market_emissions_tco2e', 'market_basis_note',
        'data_quality', 'calculation_method', 'co2_kg', 'ch4_kg', 'n2o_kg', 'gwp_set',
        'automatic_from_row_id', 'notes', 'entered_at', 'updated_at',
      ],
      ...rows.map((r) => [
        r.id, r.facility.name, scopeLabel(r.category.scope), r.category.name, r.sourceName, r.detail, r.fuelOrMaterialType,
        Number(r.quantity), r.unit, Number(r.emissionFactorValueUsed), r.emissionFactorUnitUsed, r.emissionFactorSourceUsed,
        Number(r.emissionsKgco2e), Number(r.emissionsTco2e),
        r.marketFactorValueUsed === null ? null : Number(r.marketFactorValueUsed), r.marketFactorSourceUsed,
        r.marketEmissionsTco2e === null ? null : Number(r.marketEmissionsTco2e), r.marketBasisNote,
        r.dataQualityScore, r.calculationMethod,
        r.co2Kg === null ? null : Number(r.co2Kg), r.ch4Kg === null ? null : Number(r.ch4Kg), r.n2oKg === null ? null : Number(r.n2oKg),
        r.gwpSetUsed, r.sourceActivityDataId, r.notes,
        new Date(r.enteredAt).toISOString(), new Date(r.updatedAt).toISOString(),
      ]),
    ]);
    return { filename: `activity-data-${period.year}.csv`, csv };
  }
}

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
