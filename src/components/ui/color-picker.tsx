// components/ui/color-picker.tsx
"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
import { HexColorPicker, HexColorInput } from "react-colorful";
import { Droplet } from "lucide-react";

type Props = {
  value: string;
  onChange: (hex: string) => void;
  swatches?: string[];
};

export function ColorPicker({ value, onChange, swatches = [] }: Props) {
  const [open, setOpen] = React.useState(false);

  async function pickFromScreen() {
    if ("EyeDropper" in window) {
      // @ts-expect-error - EyeDropper is not in TS lib yet in some setups
      const { sRGBHex } = await new window.EyeDropper().open();
      onChange(sRGBHex);
    } else {
      setOpen(true);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Choose color ${value}`}
          className="h-9 w-9 rounded-md border shadow-inner"
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3">
        <HexColorPicker color={value} onChange={onChange} />
        <div className="flex items-center gap-2">
          <HexColorInput
            color={value}
            onChange={onChange}
            prefixed
            className="h-9 flex-1 rounded-md border bg-background px-2"
          />
          <Button variant="outline" size="icon" onClick={pickFromScreen} title="Eyedropper">
            <Droplet className="h-4 w-4" />
          </Button>
        </div>
        {!!swatches.length && (
          <div className="grid grid-cols-8 gap-1">
            {swatches.map((c) => (
              <button
                key={c}
                onClick={() => onChange(c)}
                className="h-5 rounded-md border"
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

