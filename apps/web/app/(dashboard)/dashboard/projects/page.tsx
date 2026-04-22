import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ProjectsGrid } from '@/components/projects/projects-grid';
import type { Project } from '@qaforge/shared-types';

/** Matches GET /api/projects response shape from the backend */
interface ProjectsResponse {
  projects: Project[];
  count: number;
}

async function getProjects(accessToken: string): Promise<Project[]> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const res = await fetch(`${baseUrl}/api/projects`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return [];
  }

  const data: ProjectsResponse = await res.json();
  return data.projects ?? [];
}

export default async function ProjectsPage() {
  const supabase = createServerSupabaseClient();

  // getUser() makes a live network call to validate the token (safe on server).
  // getSession() only reads the cookie — do NOT use it alone for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const projects = user && session?.access_token
    ? await getProjects(session.access_token)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground mt-1">
          Manage your QA testing projects
        </p>
      </div>
      <ProjectsGrid initialProjects={projects} />
    </div>
  );
}
