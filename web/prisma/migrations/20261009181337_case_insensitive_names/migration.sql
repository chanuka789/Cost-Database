-- Names in lookup lists must be unique regardless of capitals ("Villa" = "villa").
CREATE UNIQUE INDEX "countries_name_lower_key" ON "countries" (lower("name"));
CREATE UNIQUE INDEX "cities_country_name_lower_key" ON "cities" ("countryId", lower("name"));
CREATE UNIQUE INDEX "building_types_name_lower_key" ON "building_types" (lower("name"));
CREATE UNIQUE INDEX "stages_name_lower_key" ON "stages" (lower("name"));
-- Emails are stored lowercase by the app; this guards against any path that forgets.
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
