require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TabitomoNativeSpeech'
  s.version        = package['version']
  s.summary        = 'Native iOS speech recognition for tabitomo'
  s.description    = 'Expo module wrapping Apple Speech recognition for tabitomo iOS builds.'
  s.license        = 'MIT'
  s.author         = 'tabitomo'
  s.homepage       = 'https://example.com'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,swift}'
end
