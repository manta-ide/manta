export declare class Tree {
    nodes: {
        [key: string]: Tree;
    };
    display(logger?: any): void;
    insert(child: string, value?: Tree): Tree;
    search(key: string): Tree | undefined;
}
export default function tree(): Tree;
