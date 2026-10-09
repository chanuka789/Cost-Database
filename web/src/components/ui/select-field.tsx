"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

/** A form dropdown: 38px trigger, menu panel with checked row. Empty value shows the placeholder. */
export function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  disabled,
  className,
  "aria-invalid": invalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <Select
      items={options}
      value={value || null}
      onValueChange={(v) => onChange((v as string | null) ?? "")}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
