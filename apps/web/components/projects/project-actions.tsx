'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api/client';
import { toastError } from '@/lib/toast-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/shared/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectActionsProps {
  project: { id: string; name: string; description?: string | null; base_url?: string | null };
  onSaved: () => void;
}

/** Edit or delete the project (the API supported both; the UI had no way to reach them). */
export function ProjectActions({ project, onSaved }: ProjectActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [baseUrl, setBaseUrl] = useState(project.base_url ?? '');

  const openEdit = () => {
    setName(project.name);
    setDescription(project.description ?? '');
    setBaseUrl(project.base_url ?? '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/api/projects/${project.id}`, {
        name: name.trim(),
        description: description.trim() || null,
        base_url: baseUrl.trim() || null,
      });
      toast.success('Project saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      toastError('Could not save the project', err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${project.name}" with all its suites, test cases, runs and bugs? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiClient.del(`/api/projects/${project.id}`);
      toast.success('Project deleted');
      router.push('/dashboard/projects');
    } catch (err) {
      toastError('Could not delete the project', err);
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Project options" disabled={deleting}>
            {deleting ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={openEdit}>
            <Pencil className="size-4" />
            Edit project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={remove} className="text-destructive focus:text-destructive">
            <Trash2 className="size-4" />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editing} onOpenChange={(o) => !saving && setEditing(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
            <DialogDescription>Test runs open the base URL; paths like /login in steps are added to it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-url">Base URL</Label>
              <Input
                id="project-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-app.example.com/"
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving && <Spinner className="text-primary-foreground" />}
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
