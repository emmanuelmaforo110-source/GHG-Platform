/**
 * Seeds:
 *  1. The 15 GHG Protocol Scope 3 categories + Scope 1/2 category rows (reference data — same for every tenant)
 *  2. The emission factors actually used in Pemandu_GHG_Inventory_Calculator.xlsx, loaded as global
 *     defaults (organizationId = null) so every new tenant starts with a validated factor set instead
 *     of an empty table.
 *  3. One demo organization/facility/admin user so you can log in and see real data immediately.
 *
 * Run with: npx prisma db seed   (after `npx prisma migrate dev`)
 */
import { PrismaClient, GhgScope, Scope1Subcategory, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  // ---------- 1. GHG Categories ----------
  const categories = [
    // Scope 1
    { scope: GhgScope.scope_1, scope3CategoryNo: null, name: 'Stationary Combustion', scope1Subcategory: Scope1Subcategory.stationary_combustion, description: 'On-site fuel combustion, e.g. backup generators, boilers.' },
    { scope: GhgScope.scope_1, scope3CategoryNo: null, name: 'Mobile Combustion', scope1Subcategory: Scope1Subcategory.mobile_combustion, description: 'Fuel combusted in company-owned/controlled vehicles.' },
    { scope: GhgScope.scope_1, scope3CategoryNo: null, name: 'Fugitive Emissions', scope1Subcategory: Scope1Subcategory.fugitive_emissions, description: 'Refrigerant leaks/top-ups from AC and refrigeration equipment.' },
    // Scope 2
    { scope: GhgScope.scope_2, scope3CategoryNo: null, name: 'Purchased Electricity', scope1Subcategory: null, description: 'Grid electricity purchased for owned/controlled facilities.' },
    // Scope 3 — all 15 categories per the GHG Protocol Scope 3 Standard
    { scope: GhgScope.scope_3, scope3CategoryNo: 1, name: 'Category 1 — Purchased Goods & Services', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 2, name: 'Category 2 — Capital Goods', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 3, name: 'Category 3 — Fuel- and Energy-Related Activities', scope1Subcategory: null, description: 'WTT of Scope 1 fuels; T&D losses of Scope 2 electricity — derived from Scope 1/2 rows.' },
    { scope: GhgScope.scope_3, scope3CategoryNo: 4, name: 'Category 4 — Upstream Transportation & Distribution', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 5, name: 'Category 5 — Waste Generated in Operations', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 6, name: 'Category 6 — Business Travel', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 7, name: 'Category 7 — Employee Commuting', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 8, name: 'Category 8 — Upstream Leased Assets', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 9, name: 'Category 9 — Downstream Transportation & Distribution', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 10, name: 'Category 10 — Processing of Sold Products', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 11, name: 'Category 11 — Use of Sold Products', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 12, name: 'Category 12 — End-of-Life Treatment of Sold Products', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 13, name: 'Category 13 — Downstream Leased Assets', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 14, name: 'Category 14 — Franchises', scope1Subcategory: null, description: null },
    { scope: GhgScope.scope_3, scope3CategoryNo: 15, name: 'Category 15 — Investments', scope1Subcategory: null, description: null },
  ];

  const categoryRecords: Record<string, number> = {};
  for (const c of categories) {
    const existing = await prisma.ghgCategory.findFirst({
      where: { scope: c.scope, scope3CategoryNo: c.scope3CategoryNo, name: c.name },
    });
    const rec = existing ?? await prisma.ghgCategory.create({ data: c });
    categoryRecords[c.name] = rec.id;
  }

  console.log(`Seeded ${categories.length} GHG categories.`);

  // ---------- 2. Emission factors (extracted from Pemandu_GHG_Inventory_Calculator.xlsx, "Emission Factors" tab) ----------
  const YEAR = 2026;
  const factors = [
    { category: 'Stationary Combustion', name: 'Automotive diesel (combustion)', value: 2.68, unit: 'kg CO2e / litre', source: 'DEFRA/BEIS GHG Conversion Factors (average diesel, incl. small biofuel blend)', isDefault: true, isReviewed: true },
    { category: 'Mobile Combustion', name: 'Petrol / gasoline (combustion)', value: 2.31, unit: 'kg CO2e / litre', source: 'DEFRA/BEIS GHG Conversion Factors (average petrol)', isDefault: true, isReviewed: true },
    { category: 'Stationary Combustion', name: 'LPG (combustion)', value: 1.51, unit: 'kg CO2e / litre', source: 'DEFRA/BEIS GHG Conversion Factors', isDefault: true, isReviewed: true },
    { category: 'Purchased Electricity', name: 'Tanzania grid electricity', value: 0.34, unit: 'kg CO2e / kWh', source: 'International grid-factor databases (IEA/Climatiq); confirmed against the UNFCCC GHG Emissions Calculator 2022 (IFI 2021 harmonised grid factor for Tanzania: 0.336 kg CO2e/kWh)', isDefault: true, isReviewed: true },
    { category: 'Fugitive Emissions', name: 'Refrigerant R-410A (GWP-100, AR6)', value: 2256, unit: 'kg CO2e / kg', source: 'IPCC AR6 (2021), GHG Protocol GWP Values (Aug 2024)', isDefault: true, isReviewed: true },
    { category: 'Fugitive Emissions', name: 'Refrigerant R-32 (GWP-100, AR6)', value: 771, unit: 'kg CO2e / kg', source: 'IPCC AR6 (2021), GHG Protocol GWP Values (Aug 2024)', isDefault: true, isReviewed: true },
    { category: 'Fugitive Emissions', name: 'Refrigerant R-134a (GWP-100, AR6)', value: 1530, unit: 'kg CO2e / kg', source: 'IPCC AR6 (2021), GHG Protocol GWP Values (Aug 2024)', isDefault: true, isReviewed: true },
    { category: 'Fugitive Emissions', name: 'Refrigerant R-22 / HCFC-22 (GWP-100, AR6)', value: 1960, unit: 'kg CO2e / kg', source: 'IPCC AR6 (2021), GHG Protocol GWP Values (Aug 2024)', isDefault: true, isReviewed: true },
    { category: 'Category 6 — Business Travel', name: 'Air travel — short-haul (avg, econ.)', value: 0.15, unit: 'kg CO2e / passenger-km', source: 'DEFRA/BEIS GHG Conversion Factors (incl. radiative forcing)', isDefault: true, isReviewed: true },
    { category: 'Category 6 — Business Travel', name: 'Air travel — long-haul (avg, econ.)', value: 0.19, unit: 'kg CO2e / passenger-km', source: 'DEFRA/BEIS GHG Conversion Factors (incl. radiative forcing)', isDefault: true, isReviewed: true },
    { category: 'Category 6 — Business Travel', name: 'Hotel stay', value: 20, unit: 'kg CO2e / room-night', source: 'Cornell Hotel Sustainability Benchmarking Index (global average, indicative)', isDefault: true, isReviewed: true },
    { category: 'Category 6 — Business Travel', name: 'Ground transport — taxi/hired car', value: 0.17, unit: 'kg CO2e / km', source: 'DEFRA/BEIS GHG Conversion Factors (average petrol/diesel car)', isDefault: true, isReviewed: true },
    { category: 'Category 7 — Employee Commuting', name: 'Employee commuting — average car', value: 0.17, unit: 'kg CO2e / km', source: 'DEFRA/BEIS GHG Conversion Factors (average passenger car)', isDefault: true, isReviewed: true },
    { category: 'Category 5 — Waste Generated in Operations', name: 'Mixed office waste to landfill', value: 0.45, unit: 'kg CO2e / kg waste', source: 'IPCC 2006 Guidelines, Vol. 5 (default, mixed municipal waste)', isDefault: true, isReviewed: true },
    { category: 'Category 3 — Fuel- and Energy-Related Activities', name: 'Well-to-tank (WTT) — diesel', value: 0.62, unit: 'kg CO2e / litre', source: 'DEFRA/BEIS GHG Conversion Factors (WTT, average biofuel blend, indicative)', isDefault: true, isReviewed: true },
    { category: 'Category 3 — Fuel- and Energy-Related Activities', name: 'Well-to-tank (WTT) — petrol', value: 0.59, unit: 'kg CO2e / litre', source: 'DEFRA/BEIS GHG Conversion Factors (WTT, average biofuel blend, indicative)', isDefault: true, isReviewed: true },
    { category: 'Category 3 — Fuel- and Energy-Related Activities', name: 'Tanzania grid — T&D loss rate', value: 0.17, unit: '% (as decimal) of kWh delivered', source: 'Indicative — Sub-Saharan African utilities typically report 15-25% system losses', isDefault: true, isReviewed: true },
  ];

  for (const f of factors) {
    const categoryId = categoryRecords[f.category];
    if (!categoryId) throw new Error(`Unknown category mapping: ${f.category}`);
    const existing = await prisma.emissionFactor.findFirst({
      where: { organizationId: null, categoryId, factorName: f.name, validYear: YEAR },
    });
    if (!existing) {
      await prisma.emissionFactor.create({
        data: {
          organizationId: null,
          categoryId,
          factorName: f.name,
          value: f.value,
          unit: f.unit,
          validYear: YEAR,
          source: f.source,
          isDefault: f.isDefault,
          isReviewed: f.isReviewed,
        },
      });
    }
  }
  console.log(`Seeded ${factors.length} emission factors for ${YEAR} (global defaults).`);

  // ---------- 3. Demo organization, facility, and admin user ----------
  const org = await prisma.organization.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Pemandu Associates (Demo)',
      country: 'Tanzania',
    },
  });

  const facility = await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      organizationId: org.id,
      name: 'Dar es Salaam Office',
      address: 'Dar es Salaam, Tanzania',
      country: 'Tanzania',
    },
  });

  const passwordHash = await argon2.hash('ChangeMe123!');
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: 'admin@pemandu.test' } },
    update: {},
    create: {
      organizationId: org.id,
      email: 'admin@pemandu.test',
      passwordHash,
      fullName: 'Demo Admin',
      role: UserRole.admin,
    },
  });

  console.log('Seeded demo organization "Pemandu Associates (Demo)" with facility and admin user.');
  console.log('  Login: admin@pemandu.test / ChangeMe123!  (change immediately outside of local dev)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
