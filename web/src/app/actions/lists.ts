"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { runAction, UserFacingError } from "@/lib/action-result";
import { requireAdmin } from "@/lib/session";

/**
 * Lookup lists: building types, project stages, countries and cities.
 * Items are never hard-deleted — they're deactivated, so BOQs already tagged
 * with them keep their tag, and they just stop appearing for new uploads.
 */

const nameSchema = z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer.");
type SimpleList = "buildingType" | "stage";
const LABEL: Record<SimpleList, string> = { buildingType: "building type", stage: "stage" };

function done() {
  revalidatePath("/admin/lists");
}

async function nameTaken(list: SimpleList, name: string, exceptId?: string) {
  const where = { name: { equals: name, mode: "insensitive" as const }, ...(exceptId ? { id: { not: exceptId } } : {}) };
  const found = list === "buildingType" ? await prisma.buildingType.findFirst({ where }) : await prisma.stage.findFirst({ where });
  return Boolean(found);
}

export async function addListItem(list: SimpleList, rawName: string) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const name = nameSchema.parse(rawName);
    if (await nameTaken(list, name)) throw new UserFacingError(`That ${LABEL[list]} already exists.`);
    const delegate = list === "buildingType" ? prisma.buildingType : prisma.stage;
    const last = await (delegate as typeof prisma.stage).aggregate({ _max: { sortOrder: true } });
    const item = await (delegate as typeof prisma.stage).create({ data: { name, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit({ userId: admin.id, action: `${list}.created`, entity: list, entityId: item.id, details: { name } });
    done();
    return undefined;
  });
}

export async function renameListItem(list: SimpleList, id: string, rawName: string) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const name = nameSchema.parse(rawName);
    if (await nameTaken(list, name, id)) throw new UserFacingError(`That ${LABEL[list]} already exists.`);
    const delegate = (list === "buildingType" ? prisma.buildingType : prisma.stage) as typeof prisma.stage;
    const before = await delegate.findUniqueOrThrow({ where: { id } });
    await delegate.update({ where: { id }, data: { name } });
    await audit({ userId: admin.id, action: `${list}.renamed`, entity: list, entityId: id, details: { from: before.name, to: name } });
    done();
    return undefined;
  });
}

export async function setListItemActive(list: SimpleList, id: string, active: boolean) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const delegate = (list === "buildingType" ? prisma.buildingType : prisma.stage) as typeof prisma.stage;
    const item = await delegate.update({ where: { id }, data: { active } });
    await audit({ userId: admin.id, action: `${list}.${active ? "activated" : "deactivated"}`, entity: list, entityId: id, details: { name: item.name } });
    done();
    return undefined;
  });
}

/** Moves an item one place up or down (stages keep project order: Concept → … → Tender). */
export async function moveListItem(list: SimpleList, id: string, direction: "up" | "down") {
  return runAction(async () => {
    const admin = await requireAdmin();
    const delegate = (list === "buildingType" ? prisma.buildingType : prisma.stage) as typeof prisma.stage;
    const items = await delegate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    const i = items.findIndex((x) => x.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= items.length) return undefined;
    [items[i], items[j]] = [items[j], items[i]];
    await prisma.$transaction(items.map((x, idx) => delegate.update({ where: { id: x.id }, data: { sortOrder: idx } })));
    await audit({ userId: admin.id, action: `${list}.reordered`, entity: list, entityId: id, details: { name: items[j].name, direction } });
    done();
    return undefined;
  });
}

// ── Countries and cities ────────────────────────────────────────────────────

const currencySchema = z.enum(["SAR", "AED", "QAR"]);

export async function addCountry(input: { name: string; code: string; currency: string }) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z
      .object({
        name: nameSchema,
        code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use the 2-letter country code, e.g. AE."),
        currency: currencySchema,
      })
      .parse(input);
    const clash = await prisma.country.findFirst({
      where: { OR: [{ name: { equals: data.name, mode: "insensitive" } }, { code: data.code }] },
    });
    if (clash) throw new UserFacingError("A country with this name or code already exists.");
    const last = await prisma.country.aggregate({ _max: { sortOrder: true } });
    const country = await prisma.country.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit({ userId: admin.id, action: "country.created", entity: "country", entityId: country.id, details: data });
    done();
    return undefined;
  });
}

export async function updateCountry(id: string, input: { name: string; currency: string }) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const data = z.object({ name: nameSchema, currency: currencySchema }).parse(input);
    const clash = await prisma.country.findFirst({ where: { id: { not: id }, name: { equals: data.name, mode: "insensitive" } } });
    if (clash) throw new UserFacingError("A country with this name already exists.");
    await prisma.country.update({ where: { id }, data });
    await audit({ userId: admin.id, action: "country.updated", entity: "country", entityId: id, details: data });
    done();
    return undefined;
  });
}

export async function setCountryActive(id: string, active: boolean) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const country = await prisma.country.update({ where: { id }, data: { active } });
    await audit({ userId: admin.id, action: `country.${active ? "activated" : "deactivated"}`, entity: "country", entityId: id, details: { name: country.name } });
    done();
    return undefined;
  });
}

export async function addCity(countryId: string, rawName: string) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const name = nameSchema.parse(rawName);
    const clash = await prisma.city.findFirst({ where: { countryId, name: { equals: name, mode: "insensitive" } } });
    if (clash) throw new UserFacingError("This city is already in the list.");
    const last = await prisma.city.aggregate({ where: { countryId }, _max: { sortOrder: true } });
    const city = await prisma.city.create({ data: { countryId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit({ userId: admin.id, action: "city.created", entity: "city", entityId: city.id, details: { name } });
    done();
    return undefined;
  });
}

export async function renameCity(id: string, rawName: string) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const name = nameSchema.parse(rawName);
    const city = await prisma.city.findUniqueOrThrow({ where: { id } });
    const clash = await prisma.city.findFirst({
      where: { id: { not: id }, countryId: city.countryId, name: { equals: name, mode: "insensitive" } },
    });
    if (clash) throw new UserFacingError("This city is already in the list.");
    await prisma.city.update({ where: { id }, data: { name } });
    await audit({ userId: admin.id, action: "city.renamed", entity: "city", entityId: id, details: { from: city.name, to: name } });
    done();
    return undefined;
  });
}

export async function setCityActive(id: string, active: boolean) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const city = await prisma.city.update({ where: { id }, data: { active } });
    await audit({ userId: admin.id, action: `city.${active ? "activated" : "deactivated"}`, entity: "city", entityId: id, details: { name: city.name } });
    done();
    return undefined;
  });
}
