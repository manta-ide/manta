import { FC, useId, ChangeEvent } from 'react';
import { ChevronDown } from 'lucide-react';

export interface FilterCategoryDropdownProps {
  /** Array of categories to display in the dropdown */
  categories: { label: string; value: string }[];
  /** Currently selected category value */
  selected: string;
  /** Callback invoked when a new category is selected */
  onChange: (value: string) => void;
  /** Optional additional classes for styling the wrapper */
  className?: string;
}

/**
 * FilterCategoryDropdown
 *
 * A styled, accessible dropdown menu for selecting project categories.
 * Provides native keyboard navigation and smooth focus/hover animations.
 *
 * @example
 * <FilterCategoryDropdown
 *   categories={[
 *     { label: 'All', value: 'all' },
 *     { label: 'Web', value: 'web' },
 *     { label: 'Mobile', value: 'mobile' },
 *   ]}
 *   selected={currentCategory}
 *   onChange={(value) => setCategory(value)}
 * />
 */
const FilterCategoryDropdown: FC<FilterCategoryDropdownProps> = ({
  categories,
  selected,
  onChange,
  className = '',
}) => {
  const id = useId();

  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={`relative inline-block ${className}`}>  
      {/* Screen-reader only label */}
      <label htmlFor={`filter-category-${id}`} className="sr-only">
        Filter projects by category
      </label>
      <select
        id={`filter-category-${id}`}
        value={selected}
        onChange={handleChange}
        className="appearance-none w-full border border-gray-300 bg-white rounded-md py-2 pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
      >
        {categories.map((cat) => (
          <option key={cat.value} value={cat.value}>
            {cat.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 transition-transform duration-200"
        size={20}
      />
    </div>
  );
};

export default FilterCategoryDropdown;