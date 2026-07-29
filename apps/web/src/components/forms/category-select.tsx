'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FORM_CATEGORIES, OTHER_CATEGORY, isKnownCategory } from '@/lib/form-categories';

interface CategorySelectProps {
  /** Effective category value (empty string until a real value is chosen). */
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/**
 * Mandatory category picker: a dropdown of the curated clinical categories plus
 * "Other", which reveals a free-text field. Emits the effective category string
 * (empty while nothing valid is selected, so callers can gate submission on it).
 */
export function CategorySelect({ value, onChange, id = 'form-category' }: CategorySelectProps) {
  // Remember an explicit "Other" choice even before the custom text is typed
  // (when value is still empty), so the text field stays visible.
  const [isOther, setIsOther] = useState(value !== '' && !isKnownCategory(value));
  const selectValue = isOther ? OTHER_CATEGORY : value;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Category *</Label>
      <select
        id={id}
        required
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER_CATEGORY) {
            setIsOther(true);
            onChange('');
          } else {
            setIsOther(false);
            onChange(next);
          }
        }}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
      >
        <option value="" disabled>
          Select a category…
        </option>
        {FORM_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OTHER_CATEGORY}>{OTHER_CATEGORY}</option>
      </select>
      {isOther && (
        <Input
          aria-label="Custom category"
          placeholder="Enter a category"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
