/**
 * UI Utilities
 * 
 * Frontend utilities for common UI operations and component styling.
 * Provides utility functions for class name management and component helpers.
 * 
 * This is a frontend-only utility for UI component operations.
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines and merges class names using clsx and tailwind-merge
 * Useful for conditional styling and preventing Tailwind conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
