import AVFoundation
import ExpoModulesCore

public final class TabitomoNativeLocalModelsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabitomoNativeLocalModels")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      TabitomoLocalModelsBridge.isAvailable()
    }

    AsyncFunction("validateModelPackAsync") { (modelId: String, modelRootUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try self.validateModel(modelId: modelId, rootPath: try self.filePath(modelRootUri))
          promise.resolve([
            "modelId": modelId,
            "runtime": modelId == "ppocr-v5-mobile" ? "onnxruntime-mobile" : "sherpa-onnx-ios",
            "valid": true,
          ])
        } catch {
          promise.reject("ERR_LOCAL_MODEL_VALIDATION", error.localizedDescription)
        }
      }
    }

    AsyncFunction("transcribeAudioAsync") {
      (audioUri: String, modelId: String, modelRootUri: String, options: [String: Any], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let startedAt = Date()
        do {
          let audioPath = try self.filePath(audioUri)
          let rootPath = try self.filePath(modelRootUri)
          let pcm = try self.loadMonoFloat32PCM(path: audioPath, sampleRate: 16_000)
          let language = (options["language"] as? String) ?? "auto"
          let task = (options["task"] as? String) ?? "transcribe"
          let useITN = (options["useInverseTextNormalization"] as? Bool) ?? true
          let text = try TabitomoLocalModelsBridge.transcribeFloat32PCM(
            pcm,
            sampleRate: 16_000,
            modelId: modelId,
            rootPath: rootPath,
            language: language,
            task: task,
            useITN: useITN
          )
          promise.resolve([
            "text": text,
            "runtime": "sherpa-onnx-ios",
            "modelId": modelId,
            "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
          ])
        } catch {
          promise.reject("ERR_LOCAL_ASR", error.localizedDescription)
        }
      }
    }

    AsyncFunction("recognizeTextAsync") { (imageUri: String, modelRootUri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        let startedAt = Date()
        do {
          let imagePath = try self.filePath(imageUri)
          let rootPath = try self.filePath(modelRootUri)
          let items = try TabitomoLocalModelsBridge.recognizeText(
            atPath: imagePath,
            rootPath: rootPath
          )
          promise.resolve([
            "items": items,
            "runtime": "onnxruntime-mobile",
            "modelId": "ppocr-v5-mobile",
            "durationMs": Int(Date().timeIntervalSince(startedAt) * 1000),
          ])
        } catch {
          promise.reject("ERR_LOCAL_OCR", error.localizedDescription)
        }
      }
    }

    AsyncFunction("unloadModelAsync") { (modelId: String, modelRootUri: String) in
      if let rootPath = try? self.filePath(modelRootUri) {
        TabitomoLocalModelsBridge.unloadModel(modelId, rootPath: rootPath)
      }
    }
  }

  private func validateModel(modelId: String, rootPath: String) throws {
    try TabitomoLocalModelsBridge.validateModel(modelId, rootPath: rootPath)
  }

  private func filePath(_ value: String) throws -> String {
    if let url = URL(string: value), url.isFileURL {
      return url.path
    }
    guard !value.isEmpty else {
      throw LocalModelError.invalidPath
    }
    return value
  }

  private func loadMonoFloat32PCM(path: String, sampleRate: Double) throws -> Data {
    let file = try AVAudioFile(forReading: URL(fileURLWithPath: path))
    let sourceFormat = file.processingFormat
    guard let targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: 1,
      interleaved: false
    ), let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else {
      throw LocalModelError.audioConversionFailed
    }

    let sourceCapacity = AVAudioFrameCount(max(1, file.length))
    guard let sourceBuffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: sourceCapacity) else {
      throw LocalModelError.audioConversionFailed
    }
    try file.read(into: sourceBuffer)

    let ratio = sampleRate / sourceFormat.sampleRate
    let targetCapacity = AVAudioFrameCount(ceil(Double(sourceBuffer.frameLength) * ratio)) + 1024
    guard let targetBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: targetCapacity) else {
      throw LocalModelError.audioConversionFailed
    }

    var supplied = false
    var conversionError: NSError?
    let status = converter.convert(to: targetBuffer, error: &conversionError) { _, inputStatus in
      if supplied {
        inputStatus.pointee = .endOfStream
        return nil
      }
      supplied = true
      inputStatus.pointee = .haveData
      return sourceBuffer
    }
    if status == .error {
      throw conversionError ?? LocalModelError.audioConversionFailed
    }
    guard let channel = targetBuffer.floatChannelData?[0], targetBuffer.frameLength > 0 else {
      throw LocalModelError.emptyAudio
    }
    return Data(bytes: channel, count: Int(targetBuffer.frameLength) * MemoryLayout<Float>.size)
  }
}

private enum LocalModelError: LocalizedError {
  case invalidPath
  case audioConversionFailed
  case emptyAudio
  case inferenceFailed(String)

  var errorDescription: String? {
    switch self {
    case .invalidPath:
      return "The local model or media file path is invalid."
    case .audioConversionFailed:
      return "The recording could not be converted for offline speech recognition."
    case .emptyAudio:
      return "The recording does not contain audio samples."
    case .inferenceFailed(let message):
      return message
    }
  }
}
