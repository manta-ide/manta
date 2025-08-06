'use client';

import { FC, useState, useMemo } from 'react';
import FilterCategoryDropdown from './FilterCategoryDropdown';
import TechnologyFilterCheckboxes from './TechnologyFilterCheckboxes';
import ProjectGridLayout from './ProjectGridLayout';
import ProjectCard from './ProjectCard';

/**
 * Represents a single project entry with metadata for filtering.
 */
export interface Project {
  id: string | number;
  title: string;
  description: string;
  image: string;
  category: string;
  technologies: string[];
}

export interface DynamicFilteringBehaviorProps {
  /** Full list of projects to display and filter. */
  projects: Project[];
}

/**
 * DynamicFilteringBehavior
 *
 * Provides real-time, client-side filtering of a project gallery by category and technologies.
 * Filters apply instantly without page reload for a smooth user experience.
 * Designed with responsive Tailwind CSS and efficient memoized filtering.
 */
const DynamicFilteringBehavior: FC<DynamicFilteringBehaviorProps> = ({ projects }) => {
  // State for selected category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  // State for selected technology filters
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);

  // Derive unique categories for dropdown (including 'All')
  const categories = useMemo(() => {
    const cats = Array.from(
      new Set(projects.map((p) => p.category).filter(Boolean))
    ).map((cat) => ({ label: cat, value: cat }));
    return [{ label: 'All', value: 'all' }, ...cats];
  }, [projects]);

  // Derive unique technologies for checkboxes
  const technologies = useMemo(() => {
    const techSet = new Set<string>();
    projects.forEach((p) => p.technologies.forEach((t) => techSet.add(t)));
    return Array.from(techSet).map((tech) => ({ label: tech, value: tech }));
  }, [projects]);

  // Compute filtered list based on current filters
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // Category filter
      const matchCategory =
        selectedCategory === 'all' || p.category === selectedCategory;
      // Technology filter: if any tech selected, include projects matching at least one
      const matchTech =
        selectedTechs.length === 0 ||
        p.technologies.some((t) => selectedTechs.includes(t));
      return matchCategory && matchTech;
    });
  }, [projects, selectedCategory, selectedTechs]);

  return (
    <section aria-label="Project gallery with dynamic filters" className="py-8 px-4">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Filter controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <FilterCategoryDropdown
            categories={categories}
            selected={selectedCategory}
            onChange={setSelectedCategory}
            className="w-full max-w-xs"
          />
          <TechnologyFilterCheckboxes
            technologies={technologies}
            selected={selectedTechs}
            onChange={setSelectedTechs}
            className="w-full md:w-auto"
          />
        </div>

        {/* Project grid */}
        {filteredProjects.length > 0 ? (
          <ProjectGridLayout>
            {filteredProjects.map((proj) => (
              <ProjectCard
                key={proj.id}
                title={proj.title}
                description={proj.description}
                image={proj.image}
              />
            ))}
          </ProjectGridLayout>
        ) : (
          <p className="text-center text-gray-500">No projects match the selected filters.</p>
        )}
      </div>
    </section>
  );
};

export default DynamicFilteringBehavior;
