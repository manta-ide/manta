export declare class Logger {
    file: string;
    protected buffer: string[];
    protected flushing: Promise<void>;
    constructor(file: string);
    flush(waitForMs?: number): Promise<void>;
    log(msg: string): void;
}
