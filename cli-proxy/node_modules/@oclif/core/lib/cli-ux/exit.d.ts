export declare class ExitError extends Error {
    code: 'EEXIT';
    error?: Error;
    ux: {
        exit: number;
    };
    constructor(status: number, error?: Error);
}
