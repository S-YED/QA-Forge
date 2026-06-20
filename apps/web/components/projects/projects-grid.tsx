'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, FolderPlus, Globe, Calendar, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { CreateProjectModal } from '@/components/projects/create-project-modal';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Project } from '@qaforge/shared-types';

/** Matches GET /api/projects response shape from the backend */
interface ProjectsResponse {
  projects: Project[];
  count: number;
}

interface ProjectsGridProps {
  initialProjects: Project[];
}

export function ProjectsGrid({ initialProjects }: ProjectsGridProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const refreshProjects = async () => {
    try {
      const data = await apiClient.get<ProjectsResponse>('/api/projects');
      setProjects(data.projects ?? []);
    } catch {
      // Silently fail - the apiClient handles 401 redirect
    }
  };

  const handleProjectCreated = async () => {
    setIsModalOpen(false);
    await refreshProjects();
  };

  return (
    <div className="space-y-7">
      <PageHeader
        title="Projects"
        description="Each project is an app you test. Generate cases with AI, then run and watch them execute."
      >
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus />
          New project
        </Button>
      </PageHeader>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create your first project to start generating and running AI-driven end-to-end tests."
          action={
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus />
              Create project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="group flex h-full flex-col justify-between rounded-lg border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-base font-bold text-primary">
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                  <Badge variant="success">
                    <span className="size-1.5 rounded-full bg-success" />
                    Active
                  </Badge>
                </div>

                <h3 className="mt-4 truncate text-base font-semibold text-foreground">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {project.description}
                  </p>
                )}
              </div>

              <div className="mt-5">
                {project.base_url && (
                  <div className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-secondary px-2 py-1">
                    <Globe className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {project.base_url.replace(/^https?:\/\//, '')}
                    </span>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    {new Date(project.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    Open
                    <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateProjectModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
