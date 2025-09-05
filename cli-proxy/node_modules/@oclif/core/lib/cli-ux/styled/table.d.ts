import * as Interfaces from '../../interfaces';
export declare function table<T extends Record<string, unknown>>(data: T[], columns: table.Columns<T>, options?: table.Options): void;
export declare namespace table {
    export const Flags: {
        columns: Interfaces.OptionFlag<string | undefined>;
        csv: Interfaces.BooleanFlag<boolean>;
        extended: Interfaces.BooleanFlag<boolean>;
        filter: Interfaces.OptionFlag<string | undefined>;
        'no-header': Interfaces.BooleanFlag<boolean>;
        'no-truncate': Interfaces.BooleanFlag<boolean>;
        output: Interfaces.OptionFlag<string | undefined>;
        sort: Interfaces.OptionFlag<string | undefined>;
    };
    type IFlags = typeof Flags;
    type ExcludeFlags<T, Z> = Pick<T, Exclude<keyof T, Z>>;
    type IncludeFlags<T, K extends keyof T> = Pick<T, K>;
    export function flags(): IFlags;
    export function flags<Z extends keyof IFlags = keyof IFlags>(opts: {
        except: Z | Z[];
    }): ExcludeFlags<IFlags, Z>;
    export function flags<K extends keyof IFlags = keyof IFlags>(opts: {
        only: K | K[];
    }): IncludeFlags<IFlags, K>;
    export interface Column<T extends Record<string, unknown>> {
        extended: boolean;
        get(row: T): any;
        header: string;
        minWidth: number;
    }
    export type Columns<T extends Record<string, unknown>> = {
        [key: string]: Partial<Column<T>>;
    };
    export interface Options {
        [key: string]: any;
        columns?: string;
        extended?: boolean;
        filter?: string;
        'no-header'?: boolean;
        'no-truncate'?: boolean;
        output?: string;
        printLine?(s: any): any;
        sort?: string;
    }
    export {};
}
