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
      <div className="flex justify-end mb-6">
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 hover:bg-violet-500 transition-all duration-300 active:scale-[0.98]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-slate-900/10 p-16 text-center backdrop-blur-sm select-none">
          <div className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900/50 border border-white/[0.06] text-slate-400 shadow-inner">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-violet-500/10 to-indigo-500/10 blur-md" />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="relative z-10 text-violet-400"
            >
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold bg-gradient-to-r from-slate-100 to-slate-300 bg-clip-text text-transparent">No projects yet</h3>
          <p className="text-sm text-slate-400 mt-2 mb-6 max-w-sm">
            Create your first project to get started with AI-driven end-to-end QA testing.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/25 hover:bg-violet-500 transition-all duration-300 active:scale-[0.98]"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/dashboard/projects/${project.id}`)}
              className="group cursor-pointer rounded-2xl p-6 glass-card glow-border hover:-translate-y-1 transition-premium active:scale-[0.99] flex flex-col justify-between h-[210px]"
            >
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600/10 to-indigo-600/10 border border-white/[0.06] text-violet-300 font-extrabold text-lg group-hover:from-violet-600/20 group-hover:to-indigo-600/20 transition-all duration-300">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="inline-flex items-center rounded-full bg-violet-500/10 border border-violet-500/25 px-2.5 py-0.5 text-xs font-semibold text-violet-300">
                    Active
                  </span>
                </div>
                
                <h3 className="font-bold text-slate-100 truncate group-hover:text-violet-300 transition-colors duration-300 text-lg mt-4">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="mt-1.5 text-sm text-slate-400 line-clamp-2 leading-relaxed">
                    {project.description}
                  </p>
                )}
              </div>

              <div>
                {project.base_url && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-950/60 border border-white/[0.04] px-2.5 py-1 w-fit max-w-full">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-slate-400 shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span className="text-[11px] text-slate-350 font-mono truncate">
                      {project.base_url.replace(/^https?:\/\//, '')}
                    </span>
                  </div>
                )}
                
                <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-slate-450"
                    >
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {new Date(project.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  
                  <span className="flex items-center gap-1 text-violet-400 font-semibold group-hover:translate-x-0.5 transition-transform duration-300">
                    Open
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </div>
              </div>
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
