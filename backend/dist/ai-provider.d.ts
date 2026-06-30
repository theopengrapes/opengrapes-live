declare class KeyRotationManager {
    private keys;
    private lastResetDate;
    private counts;
    private isRotationEnabled;
    constructor();
    private checkReset;
    getNextKey(model: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'): string | null;
    increment(key: string, model: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'): void;
    exhaust(key: string, model: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite'): void;
}
export declare const rotationManager: KeyRotationManager;
export declare function transcribeImage(attachedImage: any): Promise<string>;
export declare function requestAI(body: any, options?: {
    stream?: boolean;
}): Promise<Response>;
export {};
