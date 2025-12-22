import { KeywordSpotter } from 'sherpa-onnx-node'
// @ts-ignore - no types for this package yet
import { SentencePieceProcessor } from '@sctg/sentencepiece-js'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { EventEmitter } from 'events'

class WakeWordService extends EventEmitter {
  private keywordSpotter: any = null
  private stream: any = null
  private tokenizer: any = null
  private modelDir: string
  private keywordsFile: string
  private isInitialized = false

  constructor() {
    super()
    // process.resourcesPath might be undefined during tests
    const resourcesPath = process.resourcesPath || ''
    this.modelDir = path.join(
      resourcesPath,
      'kws-models',
      'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
    )

    // In dev mode, resourcesPath might not be where we expect if not packaged.
    // Check if we are in dev and adjust path if necessary.
    if (!app.isPackaged) {
        this.modelDir = path.join(
            app.getAppPath(),
            'resources',
            'kws-models',
            'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01'
        )
    }

    this.keywordsFile = path.join(app.getPath('userData'), 'kws-keywords.txt')
  }

  async init(initialKeywords: string[] = ['Hey SpeakMCP']) {
    try {
      // Initialize Tokenizer
      this.tokenizer = new SentencePieceProcessor()
      await this.tokenizer.load(path.join(this.modelDir, 'bpe.model'))

      // Create initial keywords file
      await this.updateKeywordsFile(initialKeywords)

      this.createSpotter()
      this.isInitialized = true
      console.log('WakeWordDetector initialized')
    } catch (error) {
      console.error('Failed to initialize WakeWordDetector:', error)
    }
  }

  private async updateKeywordsFile(keywords: string[]) {
    const lines: string[] = []

    for (const keyword of keywords) {
        // Tokenize
        // Normalize to uppercase as the model expects uppercase usually?
        // Let's check the keywords.txt from model. Yes, "HELLO WORLD".
        const upper = keyword.toUpperCase()
        const pieces = this.tokenizer.encodePieces(upper)

        // Format: tokens :boost #threshold
        // Using standard boost 2.0 and threshold 0.5 for now
        // pieces need to be space separated.
        // The tokenizer returns pieces like " HE", "LLO".
        // We need to join them with spaces.
        const tokenStr = pieces.join(' ')
        lines.push(`${tokenStr} :2.0 #0.5`)
    }

    fs.writeFileSync(this.keywordsFile, lines.join('\n'), 'utf8')
  }

  private createSpotter() {
    if (this.stream) {
        // Release old stream if any?
        // JS bindings might rely on GC, but better safe.
        this.stream = null
    }

    if (this.keywordSpotter) {
        // destroy old spotter?
        this.keywordSpotter = null
    }

    const config = {
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        transducer: {
          encoder: path.join(this.modelDir, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
          decoder: path.join(this.modelDir, 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
          joiner: path.join(this.modelDir, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
        },
        tokens: path.join(this.modelDir, 'tokens.txt'),
        numThreads: 1,
        provider: 'cpu',
        debug: false,
      },
      keywordsFile: this.keywordsFile,
      keywordsScore: 2.0,
      keywordsThreshold: 0.5,
    }

    // According to docs/CLI output earlier:
    // KeywordSpotterConfig(..., keywords_file=...)
    // The JS binding takes this config structure.

    this.keywordSpotter = new KeywordSpotter(config)
    this.stream = this.keywordSpotter.createStream()
  }

  async setKeywords(keywords: string[]) {
      if (!this.tokenizer) {
          throw new Error('Tokenizer not initialized')
      }
      await this.updateKeywordsFile(keywords)
      // Re-create spotter to load new keywords
      this.createSpotter()
  }

  processAudio(buffer: Float32Array) {
    if (!this.isInitialized || !this.stream || !this.keywordSpotter) return

    // buffer is Float32Array.
    this.stream.acceptWaveform(16000, buffer)

    while (this.keywordSpotter.isReady(this.stream)) {
      this.keywordSpotter.decode(this.stream)
      const result = this.keywordSpotter.getResult(this.stream)

      if (result.keyword) {
        console.log('Wake word detected:', result.keyword)
        this.emit('detected', result.keyword)
      }
    }
  }
}

export const wakeWordService = new WakeWordService()
