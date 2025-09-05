/**
 * A wrapper around process.stdout and process.stderr that allows us to mock out the streams for testing.
 */
declare class Stream {
    channel: 'stderr' | 'stdout';
    constructor(channel: 'stderr' | 'stdout');
    get isTTY(): boolean;
    emit(event: string, ...args: any[]): boolean;
    getWindowSize(): number[];
    on(event: string, listener: (...args: any[]) => void): Stream;
    once(event: string, listener: (...args: any[]) => void): Stream;
    read(): boolean;
    write(data: string): boolean;
}
/**
 * @deprecated Use process.stdout directly. This will be removed in the next major version
 */
export declare const stdout: Stream;
/**
 * @deprecated Use process.stderr directly. This will be removed in the next major version
 */
export declare const stderr: Stream;
export {};
