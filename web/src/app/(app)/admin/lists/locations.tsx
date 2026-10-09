"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { FormMessage } from "@/components/auth/form-message";
import { addCity, addCountry, renameCity, setCityActive, setCountryActive, updateCountry } from "@/app/actions/lists";
import { RenameDialog } from "./rename-dialog";

type City = { id: string; name: string; active: boolean };
type Country = { id: string; name: string; code: string; currency: "SAR" | "AED" | "QAR"; active: boolean; cities: City[] };

const CURRENCIES = ["AED", "SAR", "QAR"] as const;

export function Locations({ countries }: { countries: Country[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add country
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {countries.map((c) => (
          <CountryCard key={c.id} country={c} onEdit={() => setEditing(c)} />
        ))}
      </div>
      <CountryDialog open={adding} country={null} onClose={() => setAdding(false)} />
      <CountryDialog open={editing !== null} country={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CountryCard({ country, onEdit }: { country: Country; onEdit: () => void }) {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState<City | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await addCity(country.id, city);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`Added ${city.trim()}`);
    setCity("");
    router.refresh();
  }

  async function run(p: Promise<{ ok: boolean; error?: string }>, success: string) {
    const res = await p;
    if (!res.ok) return toast.error(res.error ?? "Something went wrong.");
    toast.success(success);
    router.refresh();
  }

  return (
    <section className={`qs-card flex flex-col ${country.active ? "" : "opacity-75"}`} aria-label={country.name}>
      <header className="flex items-center gap-3 border-b border-qs-border px-4 py-3">
        <span className="flex h-7 min-w-9 items-center justify-center rounded-sm bg-qs-hover px-1.5 text-[11.5px] font-[600] text-qs-text-secondary">
          {country.code}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-[600]">{country.name}</h2>
          <p className="text-[12px] text-qs-text-muted">
            Currency {country.currency} · {country.cities.filter((x) => x.active).length} cities
          </p>
        </div>
        {!country.active ? <Badge>Hidden</Badge> : null}
        <Menu>
          <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${country.name}`} />}>
            <MoreHorizontal aria-hidden />
          </MenuTrigger>
          <MenuContent className="w-48">
            <MenuItem onClick={onEdit}>
              <Pencil aria-hidden />
              Edit country
            </MenuItem>
            <MenuItem onClick={() => run(setCountryActive(country.id, !country.active), country.active ? "Country hidden" : "Country shown again")}>
              {country.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {country.active ? "Hide country" : "Show country"}
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>
      <ul className="flex flex-wrap gap-1.5 px-4 py-3">
        {country.cities.map((x) => (
          <li key={x.id}>
            <Menu>
              <MenuTrigger
                className={`inline-flex h-7 items-center gap-1 rounded-sm border px-2.5 text-[12.5px] transition-colors outline-none hover:bg-qs-hover focus-visible:shadow-[var(--qs-focus-ring)] data-popup-open:bg-qs-hover ${
                  x.active ? "border-qs-border bg-qs-panel text-qs-text" : "border-dashed border-qs-border-strong bg-transparent text-qs-text-faint line-through"
                }`}
              >
                {x.name}
              </MenuTrigger>
              <MenuContent align="start" className="w-44">
                <MenuItem onClick={() => setRenaming(x)}>
                  <Pencil aria-hidden />
                  Rename
                </MenuItem>
                <MenuItem onClick={() => run(setCityActive(x.id, !x.active), x.active ? `${x.name} hidden` : `${x.name} shown again`)}>
                  {x.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  {x.active ? "Hide" : "Show"}
                </MenuItem>
              </MenuContent>
            </Menu>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-auto flex gap-2 border-t border-qs-border bg-qs-raised px-4 py-3">
        <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Add a city" aria-label={`Add a city in ${country.name}`} className="h-[34px] bg-qs-panel" />
        <Button type="submit" variant="outline" disabled={pending || !city.trim()}>
          Add
        </Button>
      </form>
      <RenameDialog
        title="Rename city"
        value={renaming?.name ?? null}
        onClose={() => setRenaming(null)}
        onSave={async (value) => {
          const res = await renameCity(renaming!.id, value);
          if (!res.ok) return res.error;
          toast.success("City renamed");
          router.refresh();
          return null;
        }}
      />
    </section>
  );
}

function CountryDialog({ open, country, onClose }: { open: boolean; country: Country | null; onClose: () => void }) {
  const router = useRouter();
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>(country?.currency ?? "AED");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastCountry, setLastCountry] = useState(country);
  if (country !== lastCountry) {
    setLastCountry(country);
    setCurrency(country?.currency ?? "AED");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const res = country
      ? await updateCountry(country.id, { name: String(form.get("name") ?? ""), currency })
      : await addCountry({ name: String(form.get("name") ?? ""), code: String(form.get("code") ?? ""), currency });
    setPending(false);
    if (!res.ok) return setError(res.error);
    toast.success(country ? "Country updated" : "Country added");
    setError(null);
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{country ? "Edit country" : "Add country"}</DialogTitle>
          <DialogDescription>The currency is the default for BOQs from this country.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="country-name">Country name</Label>
            <Input id="country-name" name="name" defaultValue={country?.name} placeholder="Oman" required autoFocus />
          </div>
          {!country ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="country-code">Country code</Label>
              <Input id="country-code" name="code" placeholder="OM" maxLength={2} className="w-24 uppercase" required />
              <p className="text-[12px] text-qs-text-muted">2-letter ISO code. It can&apos;t be changed later.</p>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-semibold text-qs-text-secondary" id="country-currency">
              Currency
            </span>
            <div className="qs-segmented w-fit" role="radiogroup" aria-labelledby="country-currency">
              {CURRENCIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={currency === c} className="qs-segmented-item" onClick={() => setCurrency(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {error ? <FormMessage>{error}</FormMessage> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : country ? "Save" : "Add country"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
