// Starting lists and the first admin. Safe to run more than once: existing
// rows are left as they are, so admin edits made in the app are never undone.
import { PrismaClient, Currency } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const COUNTRIES: { name: string; code: string; currency: Currency; cities: string[] }[] = [
  {
    name: "United Arab Emirates",
    code: "AE",
    currency: "AED",
    cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain", "Al Ain"],
  },
  {
    name: "Saudi Arabia",
    code: "SA",
    currency: "SAR",
    cities: ["Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Al Khobar", "Dhahran", "Tabuk", "Abha", "AlUla", "NEOM"],
  },
  {
    name: "Qatar",
    code: "QA",
    currency: "QAR",
    cities: ["Doha", "Lusail", "Al Wakrah", "Al Khor"],
  },
];

const BUILDING_TYPES = [
  "Villa",
  "Residential apartments",
  "High-rise building",
  "Hotel",
  "Hospital",
  "Office / Commercial",
  "Retail / Mall",
  "Education",
  "Mixed-use",
  "Landscape",
  "Infrastructure",
  "Industrial / Warehouse",
];

const STAGES = ["Concept", "SD 50%", "SD 100%", "DD 50%", "DD 100%", "IFC / Construction", "Tender"];

async function seedLists() {
  for (const [i, c] of COUNTRIES.entries()) {
    const country = await prisma.country.upsert({
      where: { code: c.code },
      update: {},
      create: { name: c.name, code: c.code, currency: c.currency, sortOrder: i },
    });
    for (const [j, city] of c.cities.entries()) {
      await prisma.city.upsert({
        where: { countryId_name: { countryId: country.id, name: city } },
        update: {},
        create: { countryId: country.id, name: city, sortOrder: j },
      });
    }
  }
  for (const [i, name] of BUILDING_TYPES.entries()) {
    await prisma.buildingType.upsert({ where: { name }, update: {}, create: { name, sortOrder: i } });
  }
  for (const [i, name] of STAGES.entries()) {
    await prisma.stage.upsert({ where: { name }, update: {}, create: { name, sortOrder: i } });
  }
}

async function seedFirstAdmin() {
  if (await prisma.user.count({ where: { role: "ADMIN" } })) return;

  const name = process.env.SEED_ADMIN_NAME?.trim();
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!name || !email || !password) {
    console.warn("No admin exists. Set SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, then run the seed again.");
    return;
  }
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters.");

  const admin = await prisma.user.create({
    data: { name, email, role: "ADMIN", status: "ACTIVE", passwordHash: await hash(password, 12) },
  });
  await prisma.auditLog.create({
    data: { userId: admin.id, action: "user.seeded_admin", entity: "user", entityId: admin.id, details: { email } },
  });
  console.log(`Created first admin: ${email}`);
}

seedLists()
  .then(seedFirstAdmin)
  .then(() => console.log("Seed complete."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
