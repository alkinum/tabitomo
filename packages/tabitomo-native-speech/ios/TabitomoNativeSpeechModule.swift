import AVFoundation
import ExpoModulesCore
import Speech

private let onSpeechResult = "onSpeechResult"
private let onSpeechError = "onSpeechError"
private let onSpeechState = "onSpeechState"

public final class TabitomoNativeSpeechModule: Module {
  private var audioEngine: AVAudioEngine?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var recognizer: SFSpeechRecognizer?
  private var latestTranscript = ""
  private var isRecording = false

  public func definition() -> ModuleDefinition {
    Name("TabitomoNativeSpeech")

    Events(onSpeechResult, onSpeechError, onSpeechState)

    AsyncFunction("isAvailableAsync") { (localeIdentifier: String?) -> Bool in
      let locale = Locale(identifier: localeIdentifier ?? Locale.current.identifier)
      return SFSpeechRecognizer(locale: locale)?.isAvailable ?? false
    }

    AsyncFunction("isOnDeviceAvailableAsync") { (localeIdentifier: String?) -> Bool in
      let locale = Locale(identifier: localeIdentifier ?? Locale.current.identifier)
      guard let speechRecognizer = SFSpeechRecognizer(locale: locale), speechRecognizer.isAvailable else {
        return false
      }

      return speechRecognizer.supportsOnDeviceRecognition
    }

    AsyncFunction("requestAuthorizationAsync") { (promise: Promise) in
      SFSpeechRecognizer.requestAuthorization { status in
        promise.resolve(self.authorizationPayload(status))
      }
    }

    AsyncFunction("startRecognitionAsync") { (localeIdentifier: String?, requiresOnDeviceRecognition: Bool?, promise: Promise) in
      DispatchQueue.main.async {
        self.startRecognition(
          localeIdentifier: localeIdentifier,
          requiresOnDeviceRecognition: requiresOnDeviceRecognition ?? false,
          promise: promise
        )
      }
    }

    AsyncFunction("stopRecognitionAsync") { (promise: Promise) in
      DispatchQueue.main.async {
        let text = self.stopRecognition(cancel: false)
        promise.resolve(["text": text])
      }
    }

    AsyncFunction("cancelRecognitionAsync") {
      DispatchQueue.main.async {
        _ = self.stopRecognition(cancel: true)
      }
    }
  }

  private func startRecognition(
    localeIdentifier: String?,
    requiresOnDeviceRecognition: Bool,
    promise: Promise
  ) {
    guard !isRecording else {
      promise.resolve(nil)
      return
    }

    guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
      promise.reject("ERR_SPEECH_NOT_AUTHORIZED", "Speech recognition permission has not been granted.")
      return
    }

    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      DispatchQueue.main.async {
        guard granted else {
          promise.reject("ERR_MICROPHONE_NOT_AUTHORIZED", "Microphone permission has not been granted.")
          return
        }

        self.beginAudioRecognition(
          localeIdentifier: localeIdentifier,
          requiresOnDeviceRecognition: requiresOnDeviceRecognition,
          promise: promise
        )
      }
    }
  }

  private func beginAudioRecognition(
    localeIdentifier: String?,
    requiresOnDeviceRecognition: Bool,
    promise: Promise
  ) {
    let locale = Locale(identifier: localeIdentifier ?? Locale.current.identifier)
    guard let speechRecognizer = SFSpeechRecognizer(locale: locale), speechRecognizer.isAvailable else {
      promise.reject("ERR_SPEECH_UNAVAILABLE", "Speech recognition is not available for the selected locale.")
      return
    }

    if requiresOnDeviceRecognition && !speechRecognizer.supportsOnDeviceRecognition {
      promise.reject("ERR_ON_DEVICE_SPEECH_UNAVAILABLE", "On-device speech recognition is not available for the selected locale.")
      return
    }

    stopRecognition(cancel: true)

    let engine = AVAudioEngine()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    request.requiresOnDeviceRecognition = requiresOnDeviceRecognition

    let audioSession = AVAudioSession.sharedInstance()

    do {
      try audioSession.setCategory(.record, mode: .measurement, options: [.duckOthers])
      try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

      let inputNode = engine.inputNode
      let format = inputNode.outputFormat(forBus: 0)
      inputNode.removeTap(onBus: 0)
      inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
        request.append(buffer)
      }

      latestTranscript = ""
      recognizer = speechRecognizer
      recognitionRequest = request
      audioEngine = engine

      recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
        guard let self else {
          return
        }

        if let result {
          let text = result.bestTranscription.formattedString
          self.latestTranscript = text
          self.sendEvent(onSpeechResult, [
            "text": text,
            "isFinal": result.isFinal
          ])

          if result.isFinal {
            _ = self.stopRecognition(cancel: false)
          }
        }

        if let error {
          self.sendEvent(onSpeechError, [
            "message": error.localizedDescription
          ])
          _ = self.stopRecognition(cancel: true)
        }
      }

      engine.prepare()
      try engine.start()
      isRecording = true
      sendEvent(onSpeechState, ["state": "recording"])
      promise.resolve(nil)
    } catch {
      _ = stopRecognition(cancel: true)
      promise.reject("ERR_SPEECH_START_FAILED", error.localizedDescription)
    }
  }

  @discardableResult
  private func stopRecognition(cancel: Bool) -> String {
    if let engine = audioEngine {
      engine.stop()
      engine.inputNode.removeTap(onBus: 0)
    }

    recognitionRequest?.endAudio()

    if cancel {
      recognitionTask?.cancel()
    } else {
      recognitionTask?.finish()
    }

    recognitionTask = nil
    recognitionRequest = nil
    audioEngine = nil
    recognizer = nil

    if isRecording {
      sendEvent(onSpeechState, ["state": "idle"])
    }
    isRecording = false

    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    return latestTranscript
  }

  private func authorizationPayload(_ status: SFSpeechRecognizerAuthorizationStatus) -> [String: Any] {
    let statusString: String

    switch status {
    case .authorized:
      statusString = "authorized"
    case .denied:
      statusString = "denied"
    case .restricted:
      statusString = "restricted"
    case .notDetermined:
      statusString = "notDetermined"
    @unknown default:
      statusString = "unknown"
    }

    return [
      "status": statusString,
      "granted": status == .authorized
    ]
  }
}
