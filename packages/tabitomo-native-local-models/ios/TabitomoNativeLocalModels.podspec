require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TabitomoNativeLocalModels'
  s.version        = package['version']
  s.summary        = 'Verified on-device ASR and OCR runtimes for tabitomo'
  s.description    = 'Expo module using sherpa-onnx for Whisper/SenseVoice and ONNX Runtime for PP-OCR v5.'
  s.license        = 'Apache-2.0'
  s.author         = 'tabitomo'
  s.homepage       = 'https://tabitomo.alkinum.io'
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'onnxruntime-c', '1.27.0'

  s.vendored_frameworks = 'vendor/sherpa-onnx.xcframework'
  s.source_files = '*.{h,m,mm,swift}'
  s.public_header_files = 'TabitomoLocalModelsBridge.h'
  s.frameworks = 'Accelerate', 'AVFoundation', 'CoreGraphics', 'UIKit'
  s.libraries = 'c++'

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'DEFINES_MODULE' => 'YES',
    'HEADER_SEARCH_PATHS' => '"${PODS_TARGET_SRCROOT}/vendor/sherpa-onnx.xcframework/Headers"',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
