'use client';

import { FC } from 'react';
import DynamicFilteringBehavior, { Project } from './DynamicFilteringBehavior';

export interface ProjectsShowcaseProps {
  /** List of project entries for display */
  projects: Project[];
}

/**
 * ProjectsShowcase
 *
 * A section component that displays software engineering projects
 * with filtering options, grid layout, and project cards.
 */
const ProjectsShowcase: FC<ProjectsShowcaseProps> = ({ projects }) => {
  return (
    <section
      id="projects-showcase"
      aria-labelledby="projects-showcase-heading"
      className="bg-gray-50 py-16"
    >
      <div className="container mx-auto px-4">
        <h2
          id="projects-showcase-heading"
          className="text-3xl font-semibold text-center mb-8 text-gray-900"
        >
          Projects Showcase
        </h2>
        {/* Filtering behavior includes filter controls, grid layout, and cards */}
        <DynamicFilteringBehavior projects={projects} />
      </div>
    </section>
  );
};

export default ProjectsShowcase;
