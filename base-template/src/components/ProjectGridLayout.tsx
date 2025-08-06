import type { FC, ReactNode } from 'react';

export interface ProjectGridLayoutProps {
  /** Child ProjectCard components to render in the grid */
  children: ReactNode;
}

/**
 * ProjectGridLayout
 *
 * A responsive grid layout for organizing ProjectCard components with uniform spacing
 * and centered alignment.
 *
 * @example
 * <ProjectGridLayout>
 *   {projects.map(project => (
 *     <ProjectCard key={project.id} {...project} />
 *   ))}
 * </ProjectGridLayout>
 */
const ProjectGridLayout: FC<ProjectGridLayoutProps> = ({ children }) => {
  return (
    <section aria-label="Projects" className="py-8 px-4">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 justify-items-center">
          {children}
        </div>
      </div>
    </section>
  );
};

export default ProjectGridLayout;
