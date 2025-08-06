import { FC, useId, ChangeEvent } from 'react';

export interface TechnologyFilterCheckboxesProps {
  /** List of technologies to filter by */
  technologies: { label: string; value: string }[];
  /** Currently selected technology values */
  selected: string[];
  /** Callback invoked when the selection changes */
  onChange: (selected: string[]) => void;
  /** Optional additional Tailwind classes */
  className?: string;
}

/**
 * TechnologyFilterCheckboxes
 *
 * A group of checkboxes allowing users to filter projects by multiple technologies.
 * Includes a clear selection button and is fully accessible with keyboard navigation.
 */
const TechnologyFilterCheckboxes: FC<TechnologyFilterCheckboxesProps> = ({
  technologies,
  selected,
  onChange,
  className = '',
}) => {
  const id = useId();

  const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = e.target;
    let newSelected: string[] = [];
    if (checked) {
      newSelected = [...selected, value];
    } else {
      newSelected = selected.filter((v) => v !== value);
    }
    onChange(newSelected);
  };

  const clearSelection = () => {
    onChange([]);
  };

  return (
    <fieldset className={`space-y-2 ${className}`}>  
      {/* Accessible label for screen readers */}
      <legend className="sr-only">Filter projects by technology</legend>
      <div className="flex flex-wrap gap-4">
        {technologies.map((tech) => {
          const checkboxId = `${id}-${tech.value}`;
          const isChecked = selected.includes(tech.value);
          return (
            <div key={tech.value} className="flex items-center">
              <input
                type="checkbox"
                id={checkboxId}
                value={tech.value}
                checked={isChecked}
                onChange={handleCheckboxChange}
                className="h-4 w-4 text-primary accent-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor={checkboxId} className="ml-2 text-sm text-gray-700">
                {tech.label}
              </label>
            </div>
          );
        })}
      </div>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={clearSelection}
          className="mt-2 inline-flex items-center text-sm font-medium text-blue-600 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
        >
          Clear selection
        </button>
      )}
    </fieldset>
  );
};

export default TechnologyFilterCheckboxes;
