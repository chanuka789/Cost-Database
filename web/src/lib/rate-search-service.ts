import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  escapeLike,
  searchTokens,
  usdPegs,
  type DisplayCurrency,
  type ItemDetail,
  type RateRow,
  type SearchFilters,
  type SearchOptions,
  type SearchResult,
} from "./rate-search";

const joins = Prisma.sql`FROM rates r JOIN boq_items i ON i.id=r."itemId"
  JOIN boq_documents d ON d.id=i."documentId" JOIN projects p ON p.id=d."projectId"
  JOIN countries co ON co.id=p."countryId" JOIN cities ci ON ci.id=p."cityId"
  JOIN building_types bt ON bt.id=p."buildingTypeId" JOIN stages st ON st.id=d."stageId"
  JOIN main_descriptions m ON m.id=i."mainDescriptionId" JOIN sections s ON s.id=m."sectionId"
  JOIN bills b ON b.id=s."billId"`;
const trade = Prisma.sql`COALESCE(NULLIF(i.trade,''),NULLIF(s.heading,''),NULLIF(s."parentHeading",''),'Unclassified')`;
function multiplier(currency: DisplayCurrency) {
  return Prisma.sql`(${usdPegs[currency]}::numeric / CASE r.currency WHEN 'SAR' THEN 3.75::numeric WHEN 'AED' THEN 3.6725::numeric ELSE 3.64::numeric END)`;
}
function columns(currency: DisplayCurrency) {
  const fx = multiplier(currency);
  return Prisma.sql`r.id AS "rateId", i.id AS "itemId", d.id AS "documentId", p.id AS "projectId", m.id AS "groupId",
  i."itemRef", i.description, i."fullDescription", i.unit, i.qty::text,
  round(r.rate * ${fx},4)::text AS rate, round(r.amount * ${fx},2)::text AS amount,
  r."rateNote", r.rate::text AS "originalRate", r.amount::text AS "originalAmount",
  r.currency::text AS "originalCurrency", ${currency}::text AS currency, r."bidderId",
  (SELECT count(DISTINCT bid."bidderId")::int FROM rates bid WHERE bid."itemId"=i.id) AS "bidderCount", i.page, d."fileType",
  p.name AS "projectName", p."projectNo", p."projectDate"::text, p."projectDatePrecision"::text,
  co.name AS country, ci.name AS city, bt.name AS "buildingType", st.name AS stage, d."boqDate"::text,
  b."billNo", b.title AS "billTitle", s.heading, m.text AS "mainDescription", d."rateType"::text,
  ${trade} AS trade`;
}
export function searchWhere(filters: SearchFilters) {
  const conditions = [Prisma.sql`d.status='PUBLISHED'`];
  if (filters.projects.length)
    conditions.push(Prisma.sql`p.id IN (${Prisma.join(filters.projects)})`);
  if (filters.stages.length)
    conditions.push(Prisma.sql`st.id IN (${Prisma.join(filters.stages)})`);
  if (filters.country) conditions.push(Prisma.sql`co.id=${filters.country}`);
  if (filters.city) conditions.push(Prisma.sql`ci.id=${filters.city}`);
  if (filters.buildingType)
    conditions.push(Prisma.sql`bt.id=${filters.buildingType}`);
  if (filters.rateType)
    conditions.push(Prisma.sql`d."rateType"::text=${filters.rateType}`);
  if (filters.unit) conditions.push(Prisma.sql`i.unit=${filters.unit}`);
  if (filters.trade) conditions.push(Prisma.sql`${trade}=${filters.trade}`);
  if (filters.bidder)
    conditions.push(Prisma.sql`r."bidderId"=${filters.bidder}`);
  if (filters.boqFrom)
    conditions.push(Prisma.sql`d."boqDate">=${filters.boqFrom}::date`);
  if (filters.boqTo)
    conditions.push(Prisma.sql`d."boqDate"<=${filters.boqTo}::date`);
  if (filters.projectFrom)
    conditions.push(Prisma.sql`p."projectDate">=${filters.projectFrom}::date`);
  if (filters.projectTo)
    conditions.push(Prisma.sql`p."projectDate"<=${filters.projectTo}::date`);
  for (const token of searchTokens(filters.q)) {
    const like = `%${escapeLike(token)}%`;
    // Sizes must match exactly; fuzzy matching is for words, never dimensions.
    const fuzzy = /^[\p{L}]{3,}$/u.test(token)
      ? Prisma.sql`OR ${token} <% i."fullDescription" OR ${token} <% p.name`
      : Prisma.empty;
    const dimension = /^(\d+)x(\d+)(mm|cm|m)?$/.exec(token);
    const measurement = /^(\d+)(mm|cm|m)$/.exec(token);
    const literal = dimension
      ? `${dimension[1]}\\s*[x×]\\s*${dimension[2]}${dimension[3] ? `\\s*${dimension[3]}` : ""}`
      : measurement
        ? `${measurement[1]}\\s*${measurement[2]}`
        : token;
    const itemText = /\d/.test(token)
      ? Prisma.sql`i."fullDescription" ~* ${`(^|[^[:alnum:]])${literal}([^[:alnum:]]|$)`}`
      : Prisma.sql`i."fullDescription" ILIKE ${like}`;
    conditions.push(Prisma.sql`(i."searchVector" @@ plainto_tsquery('english',${token})
      OR ${itemText} OR p.name ILIKE ${like} OR p."projectNo" ILIKE ${like} ${fuzzy})`);
  }
  return Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
}
type Summary = {
  total: number;
  projects: number;
  numericRates: number;
  units: string[];
  median: number | null;
  min: number | null;
  max: number | null;
  unknownUnit: boolean;
};
export async function searchRates(
  filters: SearchFilters,
): Promise<SearchResult> {
  const start = performance.now();
  const where = searchWhere(filters);
  const pageSize = 50;
  const fx = multiplier(filters.currency);
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL pg_trgm.word_similarity_threshold=0.45`;
      const [summary] = await tx.$queryRaw<
        Summary[]
      >(Prisma.sql`SELECT count(*)::int AS total,
      count(DISTINCT p.id)::int AS projects, count(r.rate)::int AS "numericRates",
      COALESCE(array_agg(DISTINCT i.unit ORDER BY i.unit) FILTER (WHERE r.rate IS NOT NULL AND i.unit IS NOT NULL),'{}') AS units,
      COALESCE(bool_or(i.unit IS NULL OR i.unit='') FILTER (WHERE r.rate IS NOT NULL),false) AS "unknownUnit",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY (r.rate * ${fx})::double precision) AS median,
      min(r.rate * ${fx})::double precision AS min, max(r.rate * ${fx})::double precision AS max ${joins} ${where}`);
      const page = Math.min(
        filters.page,
        Math.max(1, Math.ceil(summary.total / pageSize)),
      );
      const rows = await tx.$queryRaw<
        RateRow[]
      >(Prisma.sql`SELECT ${columns(filters.currency)} ${joins} ${where}
      ORDER BY ts_rank_cd(i."searchVector",plainto_tsquery('english',${filters.q})) DESC,
      CASE WHEN p.name ILIKE ${`%${escapeLike(filters.q)}%`} OR p."projectNo" ILIKE ${`%${escapeLike(filters.q)}%`} THEN 1 ELSE 0 END DESC,
      greatest(word_similarity(${filters.q},i."fullDescription"),word_similarity(${filters.q},p.name)) DESC,
      d."boqDate" DESC, p.id, i."sortOrder", r.id LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
      return { summary, rows, page };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const { summary, rows, page } = result;
  return {
    rows,
    total: summary.total,
    projects: summary.projects,
    numericRates: summary.numericRates,
    units: summary.units,
    stats:
      summary.units.length === 1 &&
      !summary.unknownUnit &&
      summary.median !== null
        ? {
            median: summary.median,
            min: summary.min!,
            max: summary.max!,
            unit: summary.units[0],
          }
        : null,
    page,
    pageSize,
    elapsedMs: Math.round(performance.now() - start),
  };
}
export async function searchOptions(): Promise<SearchOptions> {
  const [
    projects,
    countries,
    cities,
    buildingTypes,
    stages,
    units,
    trades,
    bidders,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { documents: { some: { status: "PUBLISHED" } } },
      select: { id: true, name: true, projectNo: true },
      orderBy: { name: "asc" },
    }),
    prisma.country.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.city.findMany({
      select: { id: true, name: true, countryId: true },
      orderBy: { name: "asc" },
    }),
    prisma.buildingType.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.stage.findMany({
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.$queryRaw<
      { unit: string }[]
    >`SELECT DISTINCT i.unit FROM boq_items i JOIN boq_documents d ON d.id=i."documentId" WHERE d.status='PUBLISHED' AND i.unit IS NOT NULL AND i.unit<>'' ORDER BY i.unit`,
    prisma.$queryRaw<{ trade: string }[]>(
      Prisma.sql`SELECT DISTINCT ${trade} AS trade ${joins} WHERE d.status='PUBLISHED' ORDER BY trade`,
    ),
    prisma.$queryRaw<
      { bidderId: string }[]
    >`SELECT DISTINCT r."bidderId" FROM rates r JOIN boq_items i ON i.id=r."itemId" JOIN boq_documents d ON d.id=i."documentId" WHERE d.status='PUBLISHED' AND r."bidderId" IS NOT NULL ORDER BY r."bidderId"`,
  ]);
  return {
    projects,
    countries,
    cities,
    buildingTypes,
    stages,
    units: units.map((r) => r.unit),
    trades: trades.map((r) => r.trade),
    bidders: bidders.map((r) => r.bidderId),
  };
}
/** Re-read all rows under the published-only guard; client descriptions/numbers are never trusted. */
export async function basketRates(
  ids: string[],
  currency: DisplayCurrency,
): Promise<RateRow[]> {
  if (!ids.length) return [];
  const rows = await prisma.$queryRaw<RateRow[]>(
    Prisma.sql`SELECT ${columns(currency)} ${joins} WHERE d.status='PUBLISHED' AND r.id IN (${Prisma.join(ids)})`,
  );
  const byId = new Map(rows.map((r) => [r.rateId, r]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}
export async function rateDetail(
  itemId: string,
  currency: DisplayCurrency,
): Promise<ItemDetail | null> {
  return prisma.$transaction(
    async (tx) => {
      const rates = await tx.$queryRaw<RateRow[]>(
        Prisma.sql`SELECT ${columns(currency)} ${joins} WHERE d.status='PUBLISHED' AND i.id=${itemId} ORDER BY r.rate ASC NULLS LAST,r.id`,
      );
      if (!rates.length) return null;
      const item = rates[0];
      const siblings = await tx.$queryRaw<RateRow[]>(
        Prisma.sql`SELECT ${columns(currency)} ${joins} WHERE d.status='PUBLISHED' AND m.id=${item.groupId} AND i.id<>${itemId} ORDER BY i."sortOrder",r.id`,
      );
      // Timeline compares the exact description and unit, not loosely related search hits.
      const historyWhere = Prisma.sql`WHERE d.status='PUBLISHED' AND i."fullDescription"=${item.fullDescription} AND i.unit IS NOT DISTINCT FROM ${item.unit} AND r.rate IS NOT NULL`;
      const history = await tx.$queryRaw<ItemDetail["history"]>(
        Prisma.sql`SELECT d."boqDate"::text, p.name AS "projectName", round(r.rate * ${multiplier(currency)},4)::text AS rate, d."rateType"::text,st.name AS stage ${joins} ${historyWhere} ORDER BY d."boqDate" ASC,r.id LIMIT 500`,
      );
      const [count] = await tx.$queryRaw<{ count: number }[]>(
        Prisma.sql`SELECT count(*)::int AS count ${joins} ${historyWhere}`,
      );
      const numeric = rates
        .filter((r) => r.rate !== null)
        .map((r) => Number(r.rate))
        .sort((a, b) => a - b);
      const middle = Math.floor(numeric.length / 2);
      return {
        item,
        rates,
        siblings,
        history,
        historyCount: count.count,
        stats: numeric.length
          ? {
              min: numeric[0],
              max: numeric[numeric.length - 1],
              median:
                numeric.length % 2
                  ? numeric[middle]
                  : (numeric[middle - 1] + numeric[middle]) / 2,
            }
          : null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
