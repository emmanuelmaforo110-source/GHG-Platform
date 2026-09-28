/**
 * Prisma returns BigInt for BIGINT columns (e.g. attachments.file_size_bytes), and JSON.stringify
 * cannot serialise BigInt — any API response or audit-log entry containing one would fail with
 * "Do not know how to serialize a BigInt". File sizes and similar values are far below 2^53, so
 * they are sent as ordinary numbers. Imported once, at the top of main.ts.
 */
declare global {
  interface BigInt {
    toJSON(): number | string;
  }
}

if (!(BigInt.prototype as { toJSON?: unknown }).toJSON) {
  BigInt.prototype.toJSON = function (this: bigint) {
    return this <= BigInt(Number.MAX_SAFE_INTEGER) && this >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(this) : this.toString();
  };
}

export {};
