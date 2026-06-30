'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateForm } from '@/hooks/use-forms';
import { cn } from '@/lib/utils';
import { UserRound, ClipboardList } from 'lucide-react';

interface CreateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateFormDialog({ open, onOpenChange }: CreateFormDialogProps) {
  const router = useRouter();
  const createForm = useCreateForm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [formType, setFormType] = useState<'PATIENT' | 'NON_PATIENT'>('PATIENT');

  function resetFields() {
    setName('');
    setDescription('');
    setCategory('');
    setFormType('PATIENT');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) return;

    const result = await createForm.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      formType,
    });

    resetFields();
    onOpenChange(false);
    router.push(`/forms/${result.id}/builder`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Form</DialogTitle>
            <DialogDescription>
              Create a new medical form template. You can design the form layout
              in the builder after creation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Form Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormType('PATIENT')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors',
                    formType === 'PATIENT'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30',
                  )}
                >
                  <UserRound className={cn('h-6 w-6', formType === 'PATIENT' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">Patient Form</span>
                  <span className="text-xs text-muted-foreground">
                    Tied to a patient encounter
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('NON_PATIENT')}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-colors',
                    formType === 'NON_PATIENT'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30',
                  )}
                >
                  <ClipboardList className={cn('h-6 w-6', formType === 'NON_PATIENT' ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-sm font-medium">Non-Patient Form</span>
                  <span className="text-xs text-muted-foreground">
                    OT checklist, audit, etc.
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="form-name">Name *</Label>
              <Input
                id="form-name"
                placeholder="e.g., Patient Intake Form"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="form-description">Description</Label>
              <Input
                id="form-description"
                placeholder="Brief description of the form"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="form-category">Category</Label>
              <Input
                id="form-category"
                placeholder="e.g., Intake, Assessment, Consent"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createForm.isPending}
            >
              {createForm.isPending ? 'Creating...' : 'Create Form'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
