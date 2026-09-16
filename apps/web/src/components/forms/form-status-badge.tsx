import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Every FormStatus the API can return — see prisma FormStatus enum. */
type FormStatus = 'DRAFT' | 'CONVERTING' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'RETIRED';

interface FormStatusBadgeProps {
  status: FormStatus | (string & {});
  /**
   * A published form whose latest version is an unpublished draft — edits
   * (refine, bindings, history) forked it and nobody has published it yet.
   * Clinicians keep filling the published version until they do. Shown as a
   * companion badge so the state is never silent in a list.
   */
  draftPending?: boolean;
}

const statusConfig: Record<FormStatus, { label: string; className: string }> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
  },
  CONVERTING: {
    label: 'Converting',
    className: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100',
  },
  REVIEW: {
    label: 'In review',
    className: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100',
  },
  PUBLISHED: {
    label: 'Published',
    className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
  },
  RETIRED: {
    label: 'Retired',
    className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
  },
};

export function FormStatusBadge({ status, draftPending }: FormStatusBadgeProps) {
  // A status this component has never heard of (a future enum value, or bad
  // data) must degrade to a plain badge — it took the whole preview page down
  // for every freshly converted (REVIEW) form when it crashed here instead.
  const config = statusConfig[status as FormStatus] ?? {
    label: status.charAt(0) + status.slice(1).toLowerCase(),
    className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
  };

  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className={cn(config.className)}>
        {config.label}
      </Badge>
      {draftPending && (
        <Badge
          variant="outline"
          className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50"
          title="This form has been edited since it was published. The published version stays in use until the draft is published from the preview page."
        >
          Draft pending
        </Badge>
      )}
    </span>
  );
}

/**
 * Does a form carry an unpublished draft newer than what clinicians fill?
 * `versions[0]` is the latest version in every form payload the API returns.
 */
export function hasPendingDraft(form: {
  status: string;
  versions?: Array<{ publishedAt?: string | null }>;
}): boolean {
  const latest = form.versions?.[0];
  return form.status === 'PUBLISHED' && !!latest && !latest.publishedAt;
}
