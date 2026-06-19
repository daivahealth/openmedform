import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FormStatusBadgeProps {
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

const statusConfig: Record<
  FormStatusBadgeProps['status'],
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100',
  },
  PUBLISHED: {
    label: 'Published',
    className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
  },
};

export function FormStatusBadge({ status }: FormStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant="outline" className={cn(config.className)}>
      {config.label}
    </Badge>
  );
}
