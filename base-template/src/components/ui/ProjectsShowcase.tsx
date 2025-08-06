'use client';
import React, { useState, useMemo } from 'react';
import ProjectCard, { ProjectCardProps } from './ProjectCard';
import FilterBar from './FilterBar';

/**
 * Extended project type to include filtering metadata
 */
export interface Project extends ProjectCardProps {
  /** Unique identifier for the project */
  id: string;
  /** Category for filtering */
  category: string;
  /** ISO date string for sorting/filtering */
  date: string;
}

export interface ProjectsShowcaseProps {
  /** List of projects to display */
  projects: Project[];
}

const ProjectsShowcase: React.FC<ProjectsShowcaseProps> = ({ projects }) => {
  // Filter and sort state
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ startDate?: string; endDate?: string }>({});
  const [sortOption, setSortOption] = useState<'ascending' | 'descending'>('ascending');

  // Derive unique categories from projects
  const categories = useMemo(
    () => Array.from(new Set(projects.map((p) => p.category))),
    [projects]
  );

  // Apply filtering and sorting
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    if (selectedCategory) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (dateRange.startDate) {
      result = result.filter((p) => p.date >= dateRange.startDate!);
    }
    if (dateRange.endDate) {
      result = result.filter((p) => p.date <= dateRange.endDate!);
    }

    result.sort((a, b) => {
      const aTime = new Date(a.date).getTime();
      const bTime = new Date(b.date).getTime();
      return sortOption === 'ascending' ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [projects, selectedCategory, dateRange, sortOption]);

  return (
    <section
      aria-labelledby="projects-showcase-title"
      className="w-full py-12 bg-gray-50"
    >
      <div className="max-w-7xl mx-auto px-4">
        <h2
          id="projects-showcase-title"
          className="text-3xl font-bold text-gray-900 mb-6"
        >
          Projects Showcase
        </h2>

        <FilterBar
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          onDateChange={({ startDate, endDate }) =>
            setDateRange({ startDate, endDate })
          }
          sortOption={sortOption}
          onSortChange={setSortOption}
          className="mb-8"
        />

        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                image={project.image}
                title={project.title}
                description={project.description}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-500">
            No projects found.
          </p>
        )}
      </div>
    </section>
  );
};

export default ProjectsShowcase;
