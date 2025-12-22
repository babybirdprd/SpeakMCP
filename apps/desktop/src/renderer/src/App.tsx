import { RouterProvider } from "react-router-dom"
import { router } from "./router"
import { lazy, Suspense } from "react"
import { Toaster } from "sonner"
import { ThemeProvider } from "./contexts/theme-context"
import { useStoreSync } from "./hooks/use-store-sync"
import { useWakeWordStore } from "./stores/wake-word-store"
import { WakeWordRecorder } from "./lib/wake-word-recorder"
import { useEffect, useRef } from "react"
import { rendererHandlers } from "./lib/tipc-client"

const Updater = lazy(() => import("./components/updater"))
const McpElicitationDialog = lazy(() => import("./components/mcp-elicitation-dialog"))
const McpSamplingDialog = lazy(() => import("./components/mcp-sampling-dialog"))

function StoreInitializer({ children }: { children: React.ReactNode }) {
  useStoreSync()
  return <>{children}</>
}

function WakeWordManager() {
  const { isEnabled } = useWakeWordStore()
  const recorderRef = useRef<WakeWordRecorder | null>(null)

  useEffect(() => {
    if (isEnabled) {
      if (!recorderRef.current) {
        recorderRef.current = new WakeWordRecorder()
        recorderRef.current.on('audio-chunk', (data) => {
            if (window.electron) {
                window.electron.ipcRenderer.send('wake-word:audio-chunk', data)
            }
        })
      }
      recorderRef.current.start()
    } else {
      if (recorderRef.current) {
        recorderRef.current.stop()
      }
    }

    return () => {
        if (recorderRef.current) {
            recorderRef.current.stop()
        }
    }
  }, [isEnabled])

  useEffect(() => {
      // @ts-ignore - event listener typing issue in tipc wrapper
      const unsub = rendererHandlers.on("wake-word:detected", (event, keyword) => {
          console.log("Wake word detected in renderer:", keyword)
          // Trigger the main recording action
          // We can call rendererHandlers.startRecording or similar if exposed?
          // No, rendererHandlers are for *receiving* events from main.

          // To trigger recording, we usually call a function or send an IPC message?
          // The main process handles shortcuts.
          // But here we want to trigger the UI state.

          // Actually, if the main process handles everything, we might not need to do anything here.
          // BUT, we likely want to activate the dictation UI.
          // The Dictation UI is activated by `showPanelWindowAndShowTextInput` or similar in main.
          // Or `startRecording`?

          // Let's assume for now we want to just notify the user or trigger the standard "start recording" flow.
          // Ideally, the Main process should decide what to do when wake word is detected.
          // But since the dictation logic is heavy in Renderer (Recorder.ts), maybe we need to switch from WakeWordRecorder to DictationRecorder.

          // Yes:
          // 1. Wake word detected.
          // 2. Stop WakeWordRecorder (automatically handled if we toggle isEnabled? No, we want to pause it while dictating).
          // 3. Start Dictation (Recorder.ts).

          // For this MVP, let's just toast for now or try to activate the panel.
          // Actually, if we want "hands free", we should probably start listening for command.

          // Let's trigger the "toggle voice dictation" action if available.
          // Or just show the panel.

          // Let's use tipc to show panel.
          // tipcClient.showPanelWindow()

          // But wait, the user wants to *dictate*.
          // So we should start the recording.
          // But recording logic is in `renderer/src/components/ui/textarea` or similar?
          // It's in `renderer-handlers.ts` -> `startRecording`.
          // Wait, `startRecording` in `renderer-handlers` is a type definition for messages FROM Main TO Renderer.

          // So Main process sends `startRecording` to Renderer.
          // So if Main detects wake word, Main should send `startRecording` to Renderer.
          // We don't need to handle `wake-word:detected` in App.tsx to start recording if Main does it.

          // Let's check `apps/desktop/src/main/index.ts` again.
          // I added `win.webContents.send('wake-word:detected', keyword)`.

          // I should change Main process logic to trigger `startRecording` instead of just emitting `detected`.
          // OR, I handle `detected` here and trigger the UI flow.

          // If I handle it here:
          // I need to trigger the same action as pressing the shortcut.
          // There is `useRecorder` hook or similar?
          // It seems `renderer-handlers.ts` defines what the renderer *listens* to.

          // Let's leave this effect for logging/toast for now, and let Main process handle the actual activation if possible.
          // But wait, `Recorder` is in Renderer. The Main process tells Renderer to start recording via `startRecording` IPC.

          // So in `wake-word-service.ts` or `index.ts`, when detected:
          // `getRendererHandlers(win.webContents).startRecording.send()`
      })
      return unsub
  }, [])

  return null
}

function App(): JSX.Element {
  return (
    <ThemeProvider>
      <StoreInitializer>
        <WakeWordManager />
        <RouterProvider router={router}></RouterProvider>

        <Suspense>
          <Updater />
        </Suspense>

        {/* MCP Protocol 2025-11-25 dialogs for elicitation and sampling */}
        <Suspense>
          <McpElicitationDialog />
          <McpSamplingDialog />
        </Suspense>

        <Toaster />
      </StoreInitializer>
    </ThemeProvider>
  )
}

export default App
