"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

/** Dropdown menu: panel with popup shadow, 10px radius, 4px padding; 32px rows, 6px radius. */
const Menu = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;

function MenuContent({
  className,
  align = "end",
  sideOffset = 4,
  children,
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} sideOffset={sideOffset} className="isolate z-50 outline-none">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "qs-menu min-w-44 origin-(--transform-origin) p-1 outline-none transition-[opacity,transform] duration-140 ease-[cubic-bezier(0.22,1,0.36,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({ className, tone, ...props }: MenuPrimitive.Item.Props & { tone?: "danger" }) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-tone={tone}
      className={cn("qs-menu-item cursor-default select-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-qs-text-muted", className)}
      {...props}
    />
  );
}

function MenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("qs-menu-label", className)} {...props} />;
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-qs-border", className)} {...props} />;
}

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuSeparator };
