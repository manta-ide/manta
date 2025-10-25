'use client';

import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Property } from '@/app/api/lib/schemas';
import BasePropertyEditor from './BasePropertyEditor';

interface SliderPropertyEditorProps {
  property: Property & { type: 'slider' };
  onChange: (value: number[]) => void;
  disabled?: boolean;
}

export default function SliderPropertyEditor({ property, onChange, disabled = false }: SliderPropertyEditorProps) {
  const min = typeof property.min === 'number' ? property.min : 0;
  const max = typeof property.max === 'number' ? property.max : 100;
  const step = typeof property.step === 'number' ? property.step : 1;

  // Derive a sane default when value is missing: center between min/max
  const defaultCenter = Math.round((min + max) / 2);
  const asNumber = (x: any, fallback: number) => {
    if (typeof x === 'number' && Number.isFinite(x)) return x;
    if (typeof x === 'string') {
      const n = Number(x);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  };

  const value = Array.isArray(property.value)
    ? property.value.map((v: any) => asNumber(v, defaultCenter))
    : [asNumber((property as any).value, defaultCenter)];

  // Determine display unit (optional)
  const inferUnit = (): { unit: string; asPercent: boolean } => {
    const p: any = property as any;
    if (typeof p.unit === 'string' && p.unit.trim()) return { unit: p.unit, asPercent: false };
    const id = (property.id || '').toLowerCase();
    const title = (property.title || '').toLowerCase();
    const str = `${id} ${title}`;
    if (str.includes('opacity') || (max <= 1 && min >= 0)) {
      // Treat 0..1 range as percentage for typical opacity-like sliders
      return { unit: '%', asPercent: true };
    }
    // Common sizing terms -> px
    const pxHints = ['size', 'font', 'width', 'height', 'padding', 'margin', 'radius', 'gap'];
    if (pxHints.some(h => str.includes(h))) return { unit: 'px', asPercent: false };
    return { unit: '', asPercent: false };
  };

  const { unit, asPercent } = inferUnit();

  const decimalsFromStep = (s: number) => {
    if (!Number.isFinite(s) || s <= 0) return 0;
    const text = String(s);
    const i = text.indexOf('.');
    return i === -1 ? 0 : (text.length - i - 1);
  };
  const decimals = decimalsFromStep(step);

  const fmt = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    if (asPercent) {
      const pct = v * 100;
      const dp = decimals > 0 ? decimals : 0;
      return `${pct.toFixed(dp)}%`;
    }
    return unit ? `${v.toFixed(decimals)}${unit}` : `${v.toFixed(decimals)}`;
  };

  const formatValue = (vals: number[]) => {
    if (vals.length === 1) return fmt(vals[0]);
    if (vals.length === 2) return `${fmt(vals[0])} – ${fmt(vals[1])}`;
    return vals.map(fmt).join(', ');
  };
  const valueLabel = formatValue(value);

  return (
    <BasePropertyEditor
      title={property.title}
      rightSlot={
        <span className="text-[11px] text-zinc-400 tabular-nums select-none">{valueLabel}</span>
      }
    >
      <div className="w-full px-1">
        <Slider
          value={value}
          onValueChange={onChange}
          min={min}
          max={max}
          step={step}
          showTooltip
          tooltipContent={(v) => fmt(v)}
          aria-label={property.title}
          className="[&_[data-slot=slider-track]]:bg-zinc-700 [&_[data-slot=slider-range]]:bg-white [&_[data-slot=slider-thumb]]:h-3 [&_[data-slot=slider-thumb]]:w-3"
          disabled={disabled}
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-zinc-500 tabular-nums select-none">{fmt(min)}</span>
          <span className="text-[10px] text-zinc-500 tabular-nums select-none">{fmt(max)}</span>
        </div>
      </div>
    </BasePropertyEditor>
  );
}
