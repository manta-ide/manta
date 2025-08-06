import React from 'react';
import { cn } from '@/lib/utils';

export interface FilterBarProps {
  /** Available categories for filtering */
  categories: string[];
  /** Currently selected category */
  selectedCategory?: string;
  /** Callback when category changes */
  onCategoryChange?: (category: string) => void;
  /** Currently selected start date (ISO string) */
  startDate?: string;
  /** Currently selected end date (ISO string) */
  endDate?: string;
  /** Callback when date range changes */
  onDateChange?: (range: { startDate?: string; endDate?: string }) => void;
  /** Current sort option */
  sortOption?: 'ascending' | 'descending';
  /** Callback when sort option changes */
  onSortChange?: (sortOption: 'ascending' | 'descending') => void;
  /** Whether filters are interactive (enabled) */
  interactive?: boolean;
  className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({
  categories,
  selectedCategory = '',
  onCategoryChange,
  startDate = '',
  endDate = '',
  onDateChange,
  sortOption = 'ascending',
  onSortChange,
  interactive = true,
  className,
}) => {
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onCategoryChange?.(e.target.value);
  };

  const handleDateChange = (field: 'start' | 'end') => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    if (onDateChange) {
      onDateChange({
        startDate: field === 'start' ? value : startDate,
        endDate: field === 'end' ? value : endDate,
      });
    }
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSortChange?.(e.target.value as 'ascending' | 'descending');
  };

  return (
    <div
      className={cn(
        'flex flex-wrap gap-4 items-end p-4 bg-white rounded-md shadow-sm',
        className
      )}
    >
      {/* Category Filter */}
      <div className="flex flex-col">
        <label htmlFor="filter-category" className="text-sm font-medium text-gray-700 mb-1">
          Category
        </label>
        <select
          id="filter-category"
          value={selectedCategory}
          onChange={handleCategoryChange}
          disabled={!interactive}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-col">
        <label htmlFor="filter-start-date" className="text-sm font-medium text-gray-700 mb-1">
          Start Date
        </label>
        <input
          type="date"
          id="filter-start-date"
          value={startDate}
          onChange={handleDateChange('start')}
          disabled={!interactive}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="flex flex-col">
        <label htmlFor="filter-end-date" className="text-sm font-medium text-gray-700 mb-1">
          End Date
        </label>
        <input
          type="date"
          id="filter-end-date"
          value={endDate}
          onChange={handleDateChange('end')}
          disabled={!interactive}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Sort Options */}
      <div className="flex flex-col">
        <label htmlFor="filter-sort" className="text-sm font-medium text-gray-700 mb-1">
          Sort
        </label>
        <select
          id="filter-sort"
          value={sortOption}
          onChange={handleSortChange}
          disabled={!interactive}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="ascending">Ascending</option>
          <option value="descending">Descending</option>
        </select>
      </div>
    </div>
  );
};

export default FilterBar;
