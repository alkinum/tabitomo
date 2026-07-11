import ExpoModulesCore
import ImageIO
import UIKit
import Vision

public final class TabitomoNativeVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TabitomoNativeVision")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      return true
    }

    AsyncFunction("recognizeTextAsync") { (imageUri: String, recognitionLanguages: [String], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        self.recognizeText(imageUri: imageUri, recognitionLanguages: recognitionLanguages, promise: promise)
      }
    }
  }

  private func recognizeText(imageUri: String, recognitionLanguages: [String], promise: Promise) {
    guard let image = loadImage(imageUri: imageUri), let cgImage = image.cgImage else {
      promise.reject("ERR_IMAGE_LOAD_FAILED", "Could not load the image for native OCR.")
      return
    }

    let orientation = CGImagePropertyOrientation(image.imageOrientation)
    let width = Double(cgImage.width)
    let height = Double(cgImage.height)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.01

    if !recognitionLanguages.isEmpty {
      request.recognitionLanguages = recognitionLanguages
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])

    do {
      try handler.perform([request])
    } catch {
      if !recognitionLanguages.isEmpty {
        request.recognitionLanguages = []
        do {
          try handler.perform([request])
        } catch {
          promise.reject("ERR_TEXT_RECOGNITION_FAILED", error.localizedDescription)
          return
        }
      } else {
        promise.reject("ERR_TEXT_RECOGNITION_FAILED", error.localizedDescription)
        return
      }
    }

    let items = (request.results ?? []).compactMap { observation -> [String: Any]? in
      guard let candidate = observation.topCandidates(1).first else {
        return nil
      }

      let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty else {
        return nil
      }

      let rect = observation.boundingBox
      let x = Double(rect.minX) * width
      let y = Double(1 - rect.maxY) * height
      let boxWidth = Double(rect.width) * width
      let boxHeight = Double(rect.height) * height
      let location = [
        x,
        y,
        x + boxWidth,
        y,
        x + boxWidth,
        y + boxHeight,
        x,
        y + boxHeight
      ]
      let rotateRect = [
        x + boxWidth / 2,
        y + boxHeight / 2,
        boxWidth,
        boxHeight,
        0
      ]

      return [
        "text": text,
        "location": location,
        "rotate_rect": rotateRect
      ]
    }

    promise.resolve(items)
  }

  private func loadImage(imageUri: String) -> UIImage? {
    guard let url = URL(string: imageUri) else {
      return UIImage(contentsOfFile: imageUri)
    }

    if url.isFileURL {
      return UIImage(contentsOfFile: url.path)
    }

    guard let data = try? Data(contentsOf: url) else {
      return nil
    }
    return UIImage(data: data)
  }
}

private extension CGImagePropertyOrientation {
  init(_ orientation: UIImage.Orientation) {
    switch orientation {
    case .up:
      self = .up
    case .upMirrored:
      self = .upMirrored
    case .down:
      self = .down
    case .downMirrored:
      self = .downMirrored
    case .left:
      self = .left
    case .leftMirrored:
      self = .leftMirrored
    case .right:
      self = .right
    case .rightMirrored:
      self = .rightMirrored
    @unknown default:
      self = .up
    }
  }
}
