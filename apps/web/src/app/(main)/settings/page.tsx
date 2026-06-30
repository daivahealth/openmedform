'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAiProviderConfigs,
  useCreateAiProvider,
  useUpdateAiProvider,
  useDeleteAiProvider,
  type AiProviderConfig,
} from '@/hooks/use-settings';

const PROVIDER_OPTIONS = [
  { value: 'claude', label: 'Anthropic Claude', defaultModel: 'claude-sonnet-4-6' },
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o' },
  { value: 'minimax', label: 'MiniMax', defaultModel: 'abab6.5-chat' },
  { value: 'kimi', label: 'Moonshot Kimi', defaultModel: 'moonshot-v1-8k' },
  { value: 'ollama', label: 'Ollama (Local)', defaultModel: 'llama3' },
];

function getProviderLabel(value: string) {
  return PROVIDER_OPTIONS.find((p) => p.value === value)?.label ?? value;
}

function getDefaultModel(value: string) {
  return PROVIDER_OPTIONS.find((p) => p.value === value)?.defaultModel ?? '';
}

export default function SettingsPage() {
  const { data: configs, isLoading } = useAiProviderConfigs();
  const createMutation = useCreateAiProvider();
  const updateMutation = useUpdateAiProvider();
  const deleteMutation = useDeleteAiProvider();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editConfig, setEditConfig] = useState<AiProviderConfig | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AiProviderConfig | null>(null);

  const [formProvider, setFormProvider] = useState('claude');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  const configuredProviders = new Set(configs?.map((c) => c.provider) ?? []);
  const availableProviders = PROVIDER_OPTIONS.filter(
    (p) => !configuredProviders.has(p.value),
  );

  function resetForm() {
    setFormProvider('claude');
    setFormDisplayName('');
    setFormApiKey('');
    setFormModel('');
    setFormBaseUrl('');
    setFormIsDefault(false);
  }

  function openAddDialog() {
    resetForm();
    if (availableProviders.length > 0) {
      setFormProvider(availableProviders[0].value);
      setFormDisplayName(availableProviders[0].label);
      setFormModel(availableProviders[0].defaultModel);
    }
    setShowAddDialog(true);
  }

  function openEditDialog(config: AiProviderConfig) {
    setEditConfig(config);
    setFormDisplayName(config.displayName);
    setFormApiKey('');
    setFormModel(config.model ?? '');
    setFormBaseUrl(config.baseUrl ?? '');
    setFormIsDefault(config.isDefault);
  }

  async function handleCreate() {
    await createMutation.mutateAsync({
      provider: formProvider,
      displayName: formDisplayName,
      apiKey: formApiKey,
      model: formModel || undefined,
      baseUrl: formBaseUrl || undefined,
      isDefault: formIsDefault,
    });
    setShowAddDialog(false);
    resetForm();
  }

  async function handleUpdate() {
    if (!editConfig) return;
    await updateMutation.mutateAsync({
      id: editConfig.id,
      displayName: formDisplayName,
      model: formModel || undefined,
      baseUrl: formBaseUrl || undefined,
      isDefault: formIsDefault,
      ...(formApiKey ? { apiKey: formApiKey } : {}),
    });
    setEditConfig(null);
    resetForm();
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    await deleteMutation.mutateAsync(deleteConfirm.id);
    setDeleteConfirm(null);
  }

  function handleProviderChange(value: string) {
    setFormProvider(value);
    setFormDisplayName(getProviderLabel(value));
    setFormModel(getDefaultModel(value));
    setFormBaseUrl(value === 'ollama' ? 'http://localhost:11434' : '');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Platform configuration and AI provider management
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>AI Providers</CardTitle>
                <CardDescription>
                  Configure LLM providers for AI-powered form generation
                </CardDescription>
              </div>
              {availableProviders.length > 0 && (
                <Button onClick={openAddDialog} size="sm">
                  Add Provider
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : !configs || configs.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    No AI providers configured yet. Add a provider to enable AI
                    form generation.
                  </p>
                  {availableProviders.length > 0 && (
                    <Button onClick={openAddDialog} variant="outline" size="sm">
                      Add Your First Provider
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {config.displayName}
                          </span>
                          {config.isDefault && (
                            <Badge
                              variant="outline"
                              className="bg-blue-50 text-blue-700 border-blue-200 text-xs"
                            >
                              Default
                            </Badge>
                          )}
                          {!config.isActive && (
                            <Badge
                              variant="outline"
                              className="bg-gray-50 text-gray-500 border-gray-200 text-xs"
                            >
                              Disabled
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>
                            Provider:{' '}
                            <span className="font-mono">{config.provider}</span>
                          </span>
                          {config.model && (
                            <span>
                              Model:{' '}
                              <span className="font-mono">{config.model}</span>
                            </span>
                          )}
                          <span>
                            Key:{' '}
                            <span className="font-mono">
                              {config.apiKeyMasked}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(config)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteConfirm(config)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Platform Info</CardTitle>
            <CardDescription>OpenMedForm system information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-mono">0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Backend</span>
                <span className="font-mono">NestJS 10</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frontend</span>
                <span className="font-mono">Next.js 14</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Form Engine</span>
                <span className="font-mono">formio.js v5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono">PostgreSQL 16</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Provider Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add AI Provider</DialogTitle>
            <DialogDescription>
              Configure a new LLM provider for AI form generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={formProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {availableProviders.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                {formProvider === 'ollama' ? 'API Key (optional for Ollama)' : 'API Key'}
              </Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={formProvider === 'ollama' ? 'Optional' : 'sk-...'}
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                placeholder={getDefaultModel(formProvider)}
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />
            </div>
            {(formProvider === 'ollama' || formProvider === 'minimax' || formProvider === 'kimi') && (
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  placeholder={
                    formProvider === 'ollama'
                      ? 'http://localhost:11434'
                      : 'https://api.example.com/v1'
                  }
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isDefault" className="text-sm font-normal">
                Set as default provider
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                (!formApiKey && formProvider !== 'ollama') ||
                !formDisplayName
              }
            >
              {createMutation.isPending ? 'Adding...' : 'Add Provider'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Provider Dialog */}
      <Dialog open={!!editConfig} onOpenChange={(open) => !open && setEditConfig(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editConfig?.displayName}</DialogTitle>
            <DialogDescription>
              Update provider configuration. Leave API key blank to keep the existing key.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">Display Name</Label>
              <Input
                id="edit-displayName"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-apiKey">API Key</Label>
              <Input
                id="edit-apiKey"
                type="password"
                placeholder="Leave blank to keep existing key"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
              {editConfig && (
                <p className="text-xs text-muted-foreground">
                  Current: {editConfig.apiKeyMasked}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-model">Model</Label>
              <Input
                id="edit-model"
                placeholder={editConfig ? getDefaultModel(editConfig.provider) : ''}
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />
            </div>
            {editConfig && (editConfig.provider === 'ollama' || editConfig.provider === 'minimax' || editConfig.provider === 'kimi') && (
              <div className="space-y-2">
                <Label htmlFor="edit-baseUrl">Base URL</Label>
                <Input
                  id="edit-baseUrl"
                  value={formBaseUrl}
                  onChange={(e) => setFormBaseUrl(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-isDefault"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="edit-isDefault" className="text-sm font-normal">
                Set as default provider
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditConfig(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formDisplayName}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteConfirm?.displayName}</strong>? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
