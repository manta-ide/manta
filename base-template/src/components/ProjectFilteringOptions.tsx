'use client';

import { FC } from 'react';
import FilterCategoryDropdown from './FilterCategoryDropdown';
import TechnologyFilterCheckboxes from './TechnologyFilterCheckboxes';

/**
 * Filter types available for project filtering.
 */
export type FilterType = 'dropdown' | 'checkbox';

/**
 * Generic option for filtering components.
 */
export interface FilterOption {
  label: string;
  value: string;
}

/**
 * Props for ProjectFilteringOptions component.
 * 
 * filterType: 'dropdown' for single-select,
 * 'checkbox' for multi-select.
 * filterOptions: list of options.
 * selected: string or string[] based on filterType.
 * onChange: callback with updated selection.
 */
export interface ProjectFilteringOptionsProps {
  filterType: FilterType;
  filterOptions: FilterOption[];
  selected: string | string[];
  onChange: (selection: string | string[]) => void;
  className?: string;
}

/**
 * ProjectFilteringOptions
 * 
 * Renders either a dropdown or checkbox group
 * based on the `filterType` prop. Uses FilterCategoryDropdown
 * for single selection and TechnologyFilterCheckboxes
 * for multiple selections.
 */
const ProjectFilteringOptions: FC<ProjectFilteringOptionsProps> = ({
  filterType,
  filterOptions,
  selected,
  onChange,
  className = '',
}) => {
  if (filterType === 'dropdown') {
    return (
      <FilterCategoryDropdown
        categories={filterOptions}
        selected={selected as string}
        onChange={onChange as (value: string) => void}
        className={className}
      />
    );
  }

  return (
    <TechnologyFilterCheckboxes
      technologies={filterOptions}
      selected={selected as string[]}
      onChange={onChange as (values: string[]) => void}
      className={className}
    />
  );
};

export default ProjectFilteringOptions;
