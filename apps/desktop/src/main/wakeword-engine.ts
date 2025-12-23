import vosk from 'vosk'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import recorder from 'node-record-lpcm16'
import { logApp } from './debug'

// Use app.isPackaged to determine the correct path
const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'models')
  : path.join(app.getAppPath(), 'resources/models')

const MODEL_PATH = path.join(RESOURCES_PATH, 'vosk-model-small-en-us')

let model: vosk.Model | null = null
let recognizer: vosk.Recognizer | null = null
let micInstance: any = null
let isListening = false
let currentWakeWord = 'jarvis'

export function initWakeWordEngine() {
  logApp(`[Wakeword] Initializing with model path: ${MODEL_PATH}`)

  if (!fs.existsSync(MODEL_PATH)) {
    logApp('[Wakeword] Model not found at ' + MODEL_PATH)
    return
  }

  // Set the log level to silence Vosk output
  vosk.setLogLevel(-1)

  try {
    model = new vosk.Model(MODEL_PATH)

    // Initialize with restricted grammar
    createRecognizer(currentWakeWord)

    logApp('[Wakeword] Initialization complete')
  } catch (error) {
    logApp(`[Wakeword] Failed to initialize: ${error}`)
  }
}

function createRecognizer(wakeWord: string) {
  if (!model) return

  if (recognizer) {
    recognizer.free()
    recognizer = null
  }

  try {
    // Grammar is a JSON string of an array of words
    // We add [unk] to handle unknown words
    const grammar = JSON.stringify([wakeWord, "[unk]"])
    recognizer = new vosk.Recognizer({ model: model, sampleRate: 16000, grammar })
    logApp(`[Wakeword] Recognizer created for wake word: ${wakeWord}`)
  } catch (error) {
    logApp(`[Wakeword] Failed to create recognizer: ${error}`)
  }
}

export function startWakeWordListening(onWake: () => void) {
  if (isListening) return
  if (!model || !recognizer) {
    logApp('[Wakeword] Cannot start: Engine not initialized')
    return
  }

  try {
    logApp('[Wakeword] Starting microphone...')

    micInstance = recorder.record({
      sampleRate: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: process.platform === 'win32' ? 'sox' : 'rec', // Try rec on unix, sox on windows
      silence: '10.0',
    })

    const stream = micInstance.stream()

    stream.on('data', (data: Buffer) => {
      if (recognizer && recognizer.acceptWaveform(data)) {
        const result = recognizer.result()
        if (result.text === currentWakeWord) {
          logApp('[Wakeword] WAKE WORD DETECTED!')
          onWake()
        }
      }
    })

    stream.on('error', (err: any) => {
        logApp(`[Wakeword] Microphone stream error: ${err}`)
        stopWakeWordListening()
    })

    isListening = true
    logApp('[Wakeword] Listening started')
  } catch (error) {
    logApp(`[Wakeword] Failed to start listening: ${error}`)
  }
}

export function stopWakeWordListening() {
  if (!isListening) return

  if (micInstance) {
    micInstance.stop()
    micInstance = null
  }

  isListening = false
  logApp('[Wakeword] Listening stopped')
}

export function updateWakeWord(newWord: string) {
  logApp(`[Wakeword] Updating wake word to: ${newWord}`)
  currentWakeWord = newWord.toLowerCase()
  createRecognizer(currentWakeWord)
}

export function getWakeWordStatus() {
  return {
    isListening,
    currentWakeWord,
    modelLoaded: !!model
  }
}

// Ensure cleanup on app exit
app.on('before-quit', () => {
  if (recognizer) {
    recognizer.free()
    recognizer = null
  }
  if (model) {
    model.free()
    model = null
  }
})
