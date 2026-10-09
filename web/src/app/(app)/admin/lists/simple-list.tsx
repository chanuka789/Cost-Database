"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { addListItem, moveListItem, renameListItem, setListItemActive } from "@/app/actions/lists";
import { RenameDialog } from "./rename-dialog";

type Item = { id: string; name: string; active: boolean };

export function SimpleList({
  list,
  noun,
  items,
  ordered,
  placeholder,
  hint,
}: {
  list: "buildingType" | "stage";
  noun: string;
  items: Item[];
  ordered: boolean;
  placeholder: string;
  hint?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [renaming, setRenaming] = useState<Item | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await addListItem(list, name);
    setPending(false);
    if (!res.ok) return toast.error(res.error);
    setName("");
    toast.success(`Added "${name.trim()}"`);
    router.refresh();
  }

  async function run(p: Promise<{ ok: boolean; error?: string }>, success?: string) {
    const res = await p;
    if (!res.ok) return toast.error(res.error ?? "Something went wrong.");
    if (success) toast.success(success);
    router.refresh();
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={add} className="mb-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${noun}, e.g. ${placeholder}`} aria-label={`New ${noun}`} />
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
          <Plus aria-hidden />
          Add
        </Button>
      </form>
      {hint ? <p className="mb-3 text-[12.5px] text-qs-text-muted">{hint}</p> : null}
      <div className="qs-card overflow-hidden">
        <table className="qs-table">
          <thead>
            <tr>
              {ordered ? <th className="w-14">Order</th> : null}
              <th>Name</th>
              <th className="w-28">Status</th>
              <th className="w-12">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className={item.active ? undefined : "text-qs-text-muted"}>
                {ordered ? <td className="text-qs-text-faint tabular-nums">{i + 1}</td> : null}
                <td className="font-[500]">{item.name}</td>
                <td>{item.active ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}</td>
                <td>
                  <Menu>
                    <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${item.name}`} />}>
                      <MoreHorizontal aria-hidden />
                    </MenuTrigger>
                    <MenuContent className="w-48">
                      <MenuItem onClick={() => setRenaming(item)}>
                        <Pencil aria-hidden />
                        Rename
                      </MenuItem>
                      {ordered && i > 0 ? (
                        <MenuItem onClick={() => run(moveListItem(list, item.id, "up"))}>
                          <ArrowUp aria-hidden />
                          Move up
                        </MenuItem>
                      ) : null}
                      {ordered && i < items.length - 1 ? (
                        <MenuItem onClick={() => run(moveListItem(list, item.id, "down"))}>
                          <ArrowDown aria-hidden />
                          Move down
                        </MenuItem>
                      ) : null}
                      <MenuItem onClick={() => run(setListItemActive(list, item.id, !item.active), item.active ? "Hidden" : "Shown again")}>
                        {item.active ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                        {item.active ? "Hide" : "Show"}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RenameDialog
        title={`Rename ${noun}`}
        value={renaming?.name ?? null}
        onClose={() => setRenaming(null)}
        onSave={async (value) => {
          const res = await renameListItem(list, renaming!.id, value);
          if (!res.ok) return res.error;
          toast.success("Renamed");
          router.refresh();
          return null;
        }}
      />
    </div>
  );
}
