import { StandardChalk, Theme } from '../interfaces/theme';
/**
 * Add color to text.
 * @param color color to use. Can be hex code (e.g. `#ff0000`), rgb (e.g. `rgb(255, 255, 255)`) or a chalk color (e.g. `red`)
 * @param text string to colorize
 * @returns colorized string
 */
export declare function colorize(color: string | StandardChalk | undefined, text: string): string;
export declare function parseTheme(theme: Record<string, string>): Theme;
export declare function getColor(color: string): string;
export declare function getColor(color: StandardChalk): StandardChalk;
