/**
 * UI Selection Utilities
 * 
 * Frontend utilities for managing and validating UI selection state.
 * Handles selection coordinates, validation, and display formatting.
 * 
 * This is a frontend-only utility that operates on UI selection data.
 */

export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Check if a selection is valid and meaningful (not empty or too small)
 * Used to filter out accidental or meaningless selections
 */
export function isValidSelection(selection: Selection | null | undefined): selection is Selection {
  if (!selection) return false;
  
  // Must have positive dimensions and be reasonably sized (at least 5x5 pixels)
  return selection.width >= 5 && 
         selection.height >= 5 && 
         selection.x >= 0 && 
         selection.y >= 0;
}

/**
 * Format selection dimensions for display in UI components
 * Returns a user-friendly string representation of selection size
 */
export function formatSelectionLabel(selection: Selection): string {
  return `${Math.round(selection.width)}×${Math.round(selection.height)}`;
} 