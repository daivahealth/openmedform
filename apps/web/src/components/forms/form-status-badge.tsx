import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Every FormStatus the API can return — see prisma FormStatus enum. */
type FormStatus = 'DRAFT' | 'CONVERTING' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'RETIRED';

interface FormStatusBadgeProps {
  status: FormStatus | (string & {});
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

export function FormStatusBadge({ status }: FormStatusBadgeProps) {
  // A status this component has never heard of (a future enum value, or bad
  // data) must degrade to a plain badge — it took the whole preview page down
  // for every freshly converted (REVIEW) form when it crashed here instead.
  const config = statusConfig[status as FormStatus] ?? {
    label: status.charAt(0) + status.slice(1).toLowerCase(),
    className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
  };

  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
