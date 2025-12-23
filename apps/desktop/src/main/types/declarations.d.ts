declare module 'node-record-lpcm16' {
  interface RecordOptions {
    sampleRate?: number;
    threshold?: number;
    verbose?: boolean;
    recordProgram?: string;
    silence?: string;
    device?: string;
  }

  interface MicInstance {
    stream(): NodeJS.ReadableStream;
    stop(): void;
  }

  export function record(options?: RecordOptions): MicInstance;
}

declare module 'vosk' {
  export class Model {
    constructor(modelPath: string);
    free(): void;
  }

  export class Recognizer {
    constructor(options: { model: Model; sampleRate: number; grammar?: string[] });
    acceptWaveform(data: Buffer): boolean;
    result(): { text: string };
    partialResult(): { partial: string };
    finalResult(): { text: string };
    free(): void;
  }

  export function setLogLevel(level: number): void;
}
