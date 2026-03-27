'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { CreateProjectModal } from '@/components/projects/create-project-modal';
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
  const router = useRouter();

  const refreshProjects = async () => {
    try {
      const data = await apiClient.get<ProjectsResponse>('/api/projects');
      setProjects(data.projects ?? []);
    } catch {
      // Silently fail — the apiClient handles 401 redirect
    }
  };

  const handleProjectCreated = async () => {
    setIsModalOpen(false);
    await refreshProjects();
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground/50 mb-4"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          <h3 className="text-lg font-semibold">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Create your first project to get started with QA testing.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              className="cursor-pointer rounded-lg border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
            >
              <h3 className="font-semibold text-card-foreground truncate">
                {project.name}
              </h3>
              {project.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
              {project.base_url && (
                <p className="mt-2 text-xs text-muted-foreground font-mono truncate">
                  {project.base_url}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Created{' '}
                {new Date(project.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          ))}
        </div>
      )}

      <CreateProjectModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={handleProjectCreated}
      />
    </>
  );
}
