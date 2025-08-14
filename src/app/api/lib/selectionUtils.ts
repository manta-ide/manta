import { 
  Selection,
} from './schemas';

/**
 * Validates if a selection object is meaningful for AI processing
 */
export function isValidSelection(selection: Selection | null | undefined): selection is Selection {
  if (!selection) return false;
  
  // Must have positive dimensions and be reasonably sized (at least 5x5 pixels)
  return selection.width >= 5 && 
         selection.height >= 5 && 
         selection.x >= 0 && 
         selection.y >= 0;
}