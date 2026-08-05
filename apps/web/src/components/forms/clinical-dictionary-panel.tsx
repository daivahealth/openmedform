'use client';

/**
 * The clinical dictionary — every field (and answer option) of the form beside
 * its terminology bindings, with approve / remove / manual add (#134).
 *
 * Lives as a tab in the preview page's side panel, next to the chat: mapping
 * review is the same look-adjust-look loop as refining, and the reviewer needs
 * the rendered form in view to judge whether "Oxygen saturation (LOINC
 * 59408-5)" really is what this field asks.
 *
 * Codes never render on the form itself; this panel is their only UI. Rows
 * come from form-core's collectCodedItems so an EMR embedding or an export
 * sees exactly the same mapping this panel shows.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { collectCodedItems, type CodedItemRow } from '@openmedform/form-core';
import type { OmfCoding } from '@openmedform/form-schema-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BookMarked, Check, Loader2, Plus, X } from 'lucide-react';

/** The systems offered for manual binding; P2/P3 add search over them. */
const SYSTEMS = [
  { uri: 'http://loinc.org', label: 'LOINC' },
  { uri: 'http://snomed.info/sct', label: 'SNOMED CT' },
  { uri: 'http://hl7.org/fhir/sid/icd-10', label: 'ICD-10' },
] as const;

function systemLabel(uri: string): string {
  return SYSTEMS.find((s) => s.uri === uri)?.label ?? uri.replace(/^https?:\/\//, '');
}

interface DictionaryPanelProps {
  formId: string;
  dataSchema: unknown;
  uiSchema: unknown;
}

interface CodingTarget {
  scope: string;
  optionCode?: string;
  current: OmfCoding[];
}

function useUpdateCoding(formId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { scope: string; optionCode?: string; coding: OmfCoding[] }) => {
      const { data } = await api.patch(`/api/forms/${formId}/coding`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form', formId] });
    },
  });
}

function CodingChip({
  coding,
  onApprove,
  onRemove,
  busy,
}: {
  coding: OmfCoding;
  onApprove: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  return (
    <span
      className={
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs ' +
        (coding.verified
          ? 'border-green-200 bg-green-50 text-green-900'
          : 'border-amber-200 bg-amber-50 text-amber-900')
      }
      title={coding.display}
    >
      <span className="font-medium">{systemLabel(coding.system)}</span>
      <span className="font-mono">{coding.code}</span>
      {coding.display && <span className="truncate opacity-80">{coding.display}</span>}
      {coding.verified ? (
        <Check className="h-3 w-3 shrink-0" aria-label="Verified" />
      ) : (
        <>
          <span className="opacity-70">
            {coding.source === 'ai'
              ? `AI${typeof coding.confidence === 'number' ? ` ${Math.round(coding.confidence * 100)}%` : ''}`
              : 'unverified'}
          </span>
          <button
            type="button"
            className="rounded px-1 font-medium underline-offset-2 hover:underline disabled:opacity-50"
            onClick={onApprove}
            disabled={busy}
          >
            Approve
          </button>
        </>
      )}
      <button
        type="button"
        className="opacity-60 hover:opacity-100 disabled:opacity-30"
        onClick={onRemove}
        disabled={busy}
        aria-label="Remove binding"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function AddCodeForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit: (coding: OmfCoding) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [system, setSystem] = useState<string>(SYSTEMS[0].uri);
  const [code, setCode] = useState('');
  const [display, setDisplay] = useState('');

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <select
        className="h-7 rounded-md border bg-background px-1.5 text-xs"
        value={system}
        onChange={(e) => setSystem(e.target.value)}
        aria-label="Terminology system"
      >
        {SYSTEMS.map((s) => (
          <option key={s.uri} value={s.uri}>
            {s.label}
          </option>
        ))}
      </select>
      <Input
        className="h-7 w-28 text-xs"
        placeholder="Code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Input
        className="h-7 w-40 text-xs"
        placeholder="Display (optional)"
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        className="h-7 text-xs"
        disabled={!code.trim() || busy}
        onClick={() =>
          onSubmit({
            system,
            code: code.trim(),
            ...(display.trim() ? { display: display.trim() } : {}),
            source: 'human',
            verified: true,
          })
        }
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function BindingList({
  target,
  update,
  addKey,
  openAdd,
  setOpenAdd,
}: {
  target: CodingTarget;
  update: ReturnType<typeof useUpdateCoding>;
  addKey: string;
  openAdd: string | null;
  setOpenAdd: (key: string | null) => void;
}) {
  const busy = update.isPending;
  const write = (coding: OmfCoding[]) =>
    update.mutate({ scope: target.scope, optionCode: target.optionCode, coding });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {target.current.length === 0 && openAdd !== addKey && (
        <span className="text-xs italic text-muted-foreground">Not mapped</span>
      )}
      {target.current.map((coding, i) => (
        <CodingChip
          key={`${coding.system}|${coding.code}`}
          coding={coding}
          busy={busy}
          onApprove={() =>
            write(target.current.map((c, j) => (j === i ? { ...c, verified: true } : c)))
          }
          onRemove={() => write(target.current.filter((_, j) => j !== i))}
        />
      ))}
      {openAdd === addKey ? (
        <AddCodeForm
          busy={busy}
          onCancel={() => setOpenAdd(null)}
          onSubmit={(coding) => {
            write([...target.current, coding]);
            setOpenAdd(null);
          }}
        />
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => setOpenAdd(addKey)}
        >
          <Plus className="h-3 w-3" /> Add code
        </button>
      )}
    </div>
  );
}

export function ClinicalDictionaryPanel({ formId, dataSchema, uiSchema }: DictionaryPanelProps) {
  const update = useUpdateCoding(formId);
  const [openAdd, setOpenAdd] = useState<string | null>(null);

  const rows: CodedItemRow[] = useMemo(
    () => (uiSchema ? collectCodedItems(uiSchema as never, dataSchema) : []),
    [uiSchema, dataSchema],
  );

  const mapped = rows.filter(
    (r) => r.coding.length > 0 || r.options?.some((o) => o.coding.length > 0),
  ).length;

  let lastSection: string | undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-2 text-xs text-muted-foreground">
        {rows.length} field{rows.length === 1 ? '' : 's'} · {mapped} mapped ·{' '}
        <span title="Codes are stored inside the form definition and travel with every submission.">
          SNOMED / LOINC / ICD
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            This form has no fields yet.
          </p>
        )}
        {rows.map((row) => {
          const sectionHeader =
            row.section !== lastSection ? (
              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {row.section}
              </p>
            ) : null;
          lastSection = row.section;
          return (
            <div key={row.scope} className="space-y-1">
              {sectionHeader}
              <div className="rounded-md border p-2">
                <p className="mb-1 text-sm font-medium">{row.label}</p>
                <BindingList
                  target={{ scope: row.scope, current: row.coding }}
                  update={update}
                  addKey={row.scope}
                  openAdd={openAdd}
                  setOpenAdd={setOpenAdd}
                />
                {row.options && (
                  <div className="mt-2 space-y-1.5 border-l pl-3">
                    {row.options.map((option) => (
                      <div key={option.code}>
                        <p className="text-xs text-muted-foreground">{option.label}</p>
                        <BindingList
                          target={{
                            scope: row.scope,
                            optionCode: option.code,
                            current: option.coding,
                          }}
                          update={update}
                          addKey={`${row.scope}::${option.code}`}
                          openAdd={openAdd}
                          setOpenAdd={setOpenAdd}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {update.isError && (
          <p className="text-xs text-destructive">
            {update.error instanceof Error ? update.error.message : 'Could not save the binding.'}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
        <BookMarked className="h-3.5 w-3.5" />
        Approving marks a code as clinically verified; it is stored in the form definition and
        audited.
      </div>
    </div>
  );
}
