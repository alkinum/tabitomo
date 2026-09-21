Pod::Spec.new do |s|
  s.name = 'TabitomoLayout'
  s.version = '1.0.0'
  s.summary = 'Native screen geometry for tabitomo layout'
  s.description = 'Converts React Native view bounds into UIKit screen coordinates.'
  s.license = 'MIT'
  s.author = 'tabitomo'
  s.homepage = 'https://github.com/backrunner/tabitomo'
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,swift}'
end
