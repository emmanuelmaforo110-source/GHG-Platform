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

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    const value = row[key];
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

// Supports `include: { category: true, facility: true }` style lookups via "<name>Id" foreign keys.
type Tables = Record<string, Row[]>;
const TABLE_FOR: Record<string, string> = { category: 'ghgCategory', facility: 'facility', reportingPeriod: 'reportingPeriod' };

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
      sorted(table.filter((r) => matches(r, args.where)), args.orderBy).map((r) => withIncludes(r, args.include)),
    findFirst: async (args: Row = {}) =>
      withIncludes(sorted(table.filter((r) => matches(r, args.where)), args.orderBy)[0], args.include),
    findUnique: async (args: Row) => withIncludes(table.find((r) => matches(r, args.where)), args.include),
    findUniqueOrThrow: async (args: Row) => {
      const r = table.find((x) => matches(x, args.where));
      if (!r) throw new Error('Record not found');
      return copy(r);
    },
    create: async (args: Row) => {
      const row = { id: randomUUID(), sourceActivityDataId: null, enteredAt: new Date(), updatedAt: new Date(), ...args.data };
      table.push(row);
      return withIncludes(row, args.include);
    },
    update: async (args: Row) => {
      const row = table.find((r) => matches(r, args.where));
      if (!row) throw new Error('Record to update not found');
      Object.assign(row, args.data);
      return withIncludes(row, args.include);
    },
    delete: async (args: Row) => {
      const idx = table.findIndex((r) => matches(r, args.where));
      if (idx === -1) throw new Error('Record to delete not found');
      return table.splice(idx, 1)[0];
    },
    deleteMany: async (args: Row = {}) => {
      const keep = table.filter((r) => !matches(r, args.where));
      const count = table.length - keep.length;
      table.splice(0, table.length, ...keep);
      return { count };
    },
    aggregate: async (args: Row) => {
      const rows = table.filter((r) => matches(r, args.where));
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
}) {
  const tables = {
    ghgCategory: seed.ghgCategory ?? [],
    emissionFactor: seed.emissionFactor ?? [],
    reportingPeriod: seed.reportingPeriod ?? [],
    facility: seed.facility ?? [],
    activityData: seed.activityData ?? [],
  };
  return {
    tables,
    ghgCategory: model(tables.ghgCategory, tables),
    emissionFactor: model(tables.emissionFactor, tables),
    reportingPeriod: model(tables.reportingPeriod, tables),
    facility: model(tables.facility, tables),
    activityData: model(tables.activityData, tables),
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
  };
}
