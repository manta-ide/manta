/**
 * UI Selection Utilities
 * 
 * Frontend utilities for managing and validating UI selection state.
 * Handles selection coordinates, validation, and display formatting.
 * 
 * This is a frontend-only utility that operates on UI selection data.
 */

import { Selection } from '@/app/api/lib/schemas';

/**
 * Format selection dimensions for display in UI components
 * Returns a user-friendly string representation of selection size
 */
export function formatSelectionLabel(selection: Selection): string {
  return `${Math.round(selection.width)}×${Math.round(selection.height)}`;
} 