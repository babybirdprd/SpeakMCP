use napi_derive::napi;
use napi::bindgen_prelude::*;
use std::sync::Mutex;

mod engine;
use engine::WakeWordEngine;

#[napi]
pub struct WakeWordDetector {
    engine: Mutex<WakeWordEngine>,
}

#[napi]
impl WakeWordDetector {
    #[napi(constructor)]
    pub fn new(model_path: String) -> Result<Self> {
        let engine = WakeWordEngine::new(&model_path)
            .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to load model: {}", e)))?;

        Ok(WakeWordDetector {
            engine: Mutex::new(engine),
        })
    }

    #[napi]
    pub fn process_audio(&self, buffer: Float32Array) -> Result<bool> {
        let mut engine = self.engine.lock().map_err(|_| Error::new(Status::GenericFailure, "Mutex Poisoned".to_string()))?;
        let data: &[f32] = &buffer;

        engine.detect(data)
             .map_err(|e| Error::new(Status::GenericFailure, format!("Detection error: {}", e)))
    }
}
