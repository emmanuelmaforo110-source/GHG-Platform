/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A tiny in-memory stand-in for PrismaService, used only by unit tests so the calculation flow can be
 * tested without a database. It supports the subset of Prisma calls the activity-data module uses:
 * findFirst / findMany / findUnique / findUniqueOrThrow / create / update / delete / deleteMany /
 * aggregate, plus $transaction([...]). `where` supports equality, null, { lt }, { in } and OR.
 */
import { randomUUID } from 'crypto';

type Row = Record<string, any>;

const copy = (r: Row | undefined): any => (r ? { ...r } : null);

// Supports `include: { category: true, facility: true }` style lookups via "<name>Id" foreign keys,
// and relation filters such as `where: { category: { scope: 'scope_3' } }`.
type Tables = Record<string, Row[]>;
const TABLE_FOR: Record<string, string> = { category: 'ghgCategory', facility: 'facility', reportingPeriod: 'reportingPeriod' };

function matches(row: Row, where: Row = {}, tables?: Tables): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w, tables));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w, tables));
    const value = row[key];
    const relTable = tables && TABLE_FOR[key] ? tables[TABLE_FOR[key]] : undefined;
    if (relTable && cond !== null && typeof cond === 'object') {
      const related = relTable.find((t) => t.id === row[`${key}Id`]);
      return !!related && matches(related, cond, tables);
    }
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('lt' in cond) return value < cond.lt;
      if ('lte' in cond) return value <= cond.lte;
      if ('gte' in cond) return value >= cond.gte;
      if ('in' in cond) return cond.in.includes(value);
      if ('equals' in cond) return value === cond.equals;
      return false;
    }
    return (value ?? null) === cond;
  });
}


function model(table: Row[], tables: Tables) {
  const withIncludes = (r: Row | undefined, include?: Row): any => {
    const c = copy(r);
    if (!c || !include) return c;
    for (const [rel, on] of Object.entries(include)) {
      if (!on) continue;
      const target = tables[TABLE_FOR[rel] ?? rel];
      if (target) c[rel] = copy(target.find((t) => t.id === c[`${rel}Id`]));
    }
    return c;
  };
  const sorted = (rows: Row[], orderBy?: Row | Row[]) => {
    if (!orderBy) return rows;
    const [[field, dir]] = Object.entries(Array.isArray(orderBy) ? orderBy[0] : orderBy);
    return [...rows].sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
  };
  return {
    // Results are copies, like real Prisma, so later updates don't change objects already returned.
    findMany: async (args: Row = {}) =>
      sorted(table.filter((r) => matches(r, args.where, tables)), args.orderBy).map((r) => withIncludes(r, args.include)),
    findFirst: async (args: Row = {}) =>
      withIncludes(sorted(table.filter((r) => matches(r, args.where, tables)), args.orderBy)[0], args.include),
    findUnique: async (args: Row) => withIncludes(table.find((r) => matches(r, args.where, tables)), args.include),
    findUniqueOrThrow: async (args: Row) => {
      const r = table.find((x) => matches(x, args.where, tables));
      if (!r) throw new Error('Record not found');
      return copy(r);
    },
    create: async (args: Row) => {
      const row = { id: randomUUID(), sourceActivityDataId: null, enteredAt: new Date(), updatedAt: new Date(), ...args.data };
      table.push(row);
      return withIncludes(row, args.include);
    },
    update: async (args: Row) => {
      const row = table.find((r) => matches(r, args.where, tables));
      if (!row) throw new Error('Record to update not found');
      Object.assign(row, args.data);
      return withIncludes(row, args.include);
    },
    delete: async (args: Row) => {
      const idx = table.findIndex((r) => matches(r, args.where, tables));
      if (idx === -1) throw new Error('Record to delete not found');
      return table.splice(idx, 1)[0];
    },
    deleteMany: async (args: Row = {}) => {
      const keep = table.filter((r) => !matches(r, args.where, tables));
      const count = table.length - keep.length;
      table.splice(0, table.length, ...keep);
      return { count };
    },
    aggregate: async (args: Row) => {
      const rows = table.filter((r) => matches(r, args.where, tables));
      const _sum: Row = {};
      for (const field of Object.keys(args._sum ?? {})) _sum[field] = rows.reduce((s, r) => s + Number(r[field] ?? 0), 0);
      return { _sum };
    },
  };
}

export function createFakePrisma(seed: {
  ghgCategory?: Row[];
  emissionFactor?: Row[];
  reportingPeriod?: Row[];
  facility?: Row[];
  activityData?: Row[];
  organization?: Row[];
  scope3RelevanceScreen?: Row[];
  user?: Row[];
  reductionTarget?: Row[];
  reductionInitiative?: Row[];
}) {
  const tables = {
    ghgCategory: seed.ghgCategory ?? [],
    emissionFactor: seed.emissionFactor ?? [],
    reportingPeriod: seed.reportingPeriod ?? [],
    facility: seed.facility ?? [],
    activityData: seed.activityData ?? [],
    organization: seed.organization ?? [],
    scope3RelevanceScreen: seed.scope3RelevanceScreen ?? [],
    user: seed.user ?? [],
    reductionTarget: seed.reductionTarget ?? [],
    reductionInitiative: seed.reductionInitiative ?? [],
  };
  return {
    tables,
    ghgCategory: model(tables.ghgCategory, tables),
    emissionFactor: model(tables.emissionFactor, tables),
    reportingPeriod: model(tables.reportingPeriod, tables),
    facility: model(tables.facility, tables),
    activityData: model(tables.activityData, tables),
    organization: model(tables.organization, tables),
    scope3RelevanceScreen: {
      ...model(tables.scope3RelevanceScreen, tables),
      // upsert keyed by reportingPeriodId + categoryId, as in the schema
      upsert: async (args: Row) => {
        const key = args.where.reportingPeriodId_categoryId;
        const existing = tables.scope3RelevanceScreen.find(
          (r) => r.reportingPeriodId === key.reportingPeriodId && r.categoryId === key.categoryId,
        );
        if (existing) {
          Object.assign(existing, args.update);
          return copy(existing);
        }
        const row = { id: randomUUID(), assessedAt: new Date(), ...args.create };
        tables.scope3RelevanceScreen.push(row);
        return copy(row);
      },
    },
    user: model(tables.user, tables),
    reductionTarget: model(tables.reductionTarget, tables),
    reductionInitiative: model(tables.reductionInitiative, tables),
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  };
}
