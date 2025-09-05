import { PrettyPrintableError } from '../../interfaces/errors';
type CLIErrorDisplayOptions = {
    bang?: string;
    name?: string;
};
export declare function applyPrettyPrintOptions(error: Error, options: PrettyPrintableError): PrettyPrintableError;
export default function prettyPrint(error: Error & PrettyPrintableError & CLIErrorDisplayOptions): string | undefined;
export {};
