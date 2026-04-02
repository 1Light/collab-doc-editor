declare module "y-protocols/awareness" {
  export class Awareness {
    constructor(doc: any);
    clientID: number;
    getStates(): Map<number, any>;
    getLocalState(): Record<string, any> | null;
    setLocalState(state: Record<string, any> | null): void;
    setLocalStateField(key: string, value: any): void;
    on(event: string, cb: (...args: any[]) => void): void;
    off(event: string, cb: (...args: any[]) => void): void;
  }

  export function applyAwarenessUpdate(
    awareness: Awareness,
    update: Uint8Array,
    origin?: any
  ): void;

  export function encodeAwarenessUpdate(
    awareness: Awareness,
    clients: number[]
  ): Uint8Array;
}