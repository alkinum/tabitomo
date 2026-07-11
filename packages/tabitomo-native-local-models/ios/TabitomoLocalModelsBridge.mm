#import "TabitomoLocalModelsBridge.h"

#import <UIKit/UIKit.h>

#include "onnxruntime_cxx_api.h"
#include <sherpa-onnx/c-api/c-api.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <fstream>
#include <limits>
#include <memory>
#include <mutex>
#include <numeric>
#include <queue>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

NSString *const kLocalModelsErrorDomain = @"io.alkinum.tabitomo.local-models";

void SetError(NSError **error, NSInteger code, NSString *message) {
  if (error == nullptr) return;
  *error = [NSError errorWithDomain:kLocalModelsErrorDomain
                               code:code
                           userInfo:@{NSLocalizedDescriptionKey: message}];
}

NSString *StringFromException(const std::exception &exception) {
  return [NSString stringWithUTF8String:exception.what()] ?: @"Native model inference failed.";
}

std::string StdString(NSString *value) {
  return value.UTF8String == nullptr ? std::string() : std::string(value.UTF8String);
}

bool FileExists(const std::string &path) {
  return [[NSFileManager defaultManager] fileExistsAtPath:[NSString stringWithUTF8String:path.c_str()]];
}

std::string JoinPath(const std::string &root, const std::string &name) {
  if (root.empty()) return name;
  return root.back() == '/' ? root + name : root + "/" + name;
}

std::string RequiredFile(const std::string &root, const std::string &name) {
  const std::string path = JoinPath(root, name);
  if (!FileExists(path)) {
    throw std::runtime_error("The verified model pack is missing " + name + ". Download the model again.");
  }
  return path;
}

struct AsrRecognizerHandle {
  const SherpaOnnxOfflineRecognizer *recognizer = nullptr;

  explicit AsrRecognizerHandle(const SherpaOnnxOfflineRecognizer *value) : recognizer(value) {}
  ~AsrRecognizerHandle() {
    if (recognizer != nullptr) SherpaOnnxDestroyOfflineRecognizer(recognizer);
  }
};

std::mutex gAsrMutex;
std::string gAsrKey;
std::unique_ptr<AsrRecognizerHandle> gAsrRecognizer;

std::unique_ptr<AsrRecognizerHandle> CreateAsrRecognizer(
    const std::string &modelId,
    const std::string &root,
    const std::string &language,
    const std::string &task,
    bool useITN) {
  SherpaOnnxOfflineRecognizerConfig config{};
  config.feat_config.sample_rate = 16000;
  config.feat_config.feature_dim = 80;
  config.model_config.num_threads = 2;
  config.model_config.provider = "cpu";
  config.model_config.debug = 0;
  config.decoding_method = "greedy_search";
  config.max_active_paths = 4;

  std::string tokens;
  std::string encoder;
  std::string decoder;
  std::string model;
  std::string normalizedLanguage = language == "auto" ? "" : language;
  std::string normalizedTask = task == "translate" ? "translate" : "transcribe";

  if (modelId == "whisper-base") {
    encoder = RequiredFile(root, "base-encoder.int8.onnx");
    decoder = RequiredFile(root, "base-decoder.int8.onnx");
    tokens = RequiredFile(root, "base-tokens.txt");
    config.model_config.whisper.encoder = encoder.c_str();
    config.model_config.whisper.decoder = decoder.c_str();
    config.model_config.whisper.language = normalizedLanguage.c_str();
    config.model_config.whisper.task = normalizedTask.c_str();
  } else if (modelId == "sensevoice-small") {
    model = RequiredFile(root, "model.int8.onnx");
    tokens = RequiredFile(root, "tokens.txt");
    normalizedLanguage = language.empty() ? "auto" : language;
    config.model_config.sense_voice.model = model.c_str();
    config.model_config.sense_voice.language = normalizedLanguage.c_str();
    config.model_config.sense_voice.use_itn = useITN ? 1 : 0;
  } else {
    throw std::runtime_error("Unsupported offline speech model: " + modelId + ".");
  }

  config.model_config.tokens = tokens.c_str();
  const SherpaOnnxOfflineRecognizer *recognizer = SherpaOnnxCreateOfflineRecognizer(&config);
  if (recognizer == nullptr) {
    throw std::runtime_error("sherpa-onnx could not load the verified model files.");
  }
  return std::make_unique<AsrRecognizerHandle>(recognizer);
}

AsrRecognizerHandle *GetAsrRecognizer(
    const std::string &modelId,
    const std::string &root,
    const std::string &language,
    const std::string &task,
    bool useITN) {
  const std::string key = modelId + "|" + root + "|" + language + "|" + task + "|" + (useITN ? "1" : "0");
  if (gAsrRecognizer == nullptr || gAsrKey != key) {
    gAsrRecognizer = CreateAsrRecognizer(modelId, root, language, task, useITN);
    gAsrKey = key;
  }
  return gAsrRecognizer.get();
}

struct ImagePixels {
  int width = 0;
  int height = 0;
  std::vector<uint8_t> rgba;
};

ImagePixels LoadImagePixels(NSString *path) {
  UIImage *source = [UIImage imageWithContentsOfFile:path];
  if (source == nil) throw std::runtime_error("Could not load the image for PP-OCR.");

  UIGraphicsBeginImageContextWithOptions(source.size, YES, source.scale);
  [source drawInRect:CGRectMake(0, 0, source.size.width, source.size.height)];
  UIImage *normalized = UIGraphicsGetImageFromCurrentImageContext();
  UIGraphicsEndImageContext();
  CGImageRef image = normalized.CGImage;
  if (image == nullptr) throw std::runtime_error("Could not decode the image pixels for PP-OCR.");

  ImagePixels output;
  output.width = static_cast<int>(CGImageGetWidth(image));
  output.height = static_cast<int>(CGImageGetHeight(image));
  output.rgba.resize(static_cast<size_t>(output.width) * output.height * 4);

  CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(
      output.rgba.data(), output.width, output.height, 8, output.width * 4,
      colorSpace, kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(colorSpace);
  if (context == nullptr) throw std::runtime_error("Could not allocate the PP-OCR image buffer.");
  CGContextTranslateCTM(context, 0, output.height);
  CGContextScaleCTM(context, 1, -1);
  CGContextDrawImage(context, CGRectMake(0, 0, output.width, output.height), image);
  CGContextRelease(context);
  return output;
}

float SampleChannel(const ImagePixels &image, float x, float y, int channel) {
  x = std::clamp(x, 0.0f, static_cast<float>(image.width - 1));
  y = std::clamp(y, 0.0f, static_cast<float>(image.height - 1));
  const int x0 = static_cast<int>(std::floor(x));
  const int y0 = static_cast<int>(std::floor(y));
  const int x1 = std::min(x0 + 1, image.width - 1);
  const int y1 = std::min(y0 + 1, image.height - 1);
  const float dx = x - x0;
  const float dy = y - y0;
  const auto value = [&](int px, int py) -> float {
    return image.rgba[(static_cast<size_t>(py) * image.width + px) * 4 + channel];
  };
  const float top = value(x0, y0) * (1 - dx) + value(x1, y0) * dx;
  const float bottom = value(x0, y1) * (1 - dx) + value(x1, y1) * dx;
  return top * (1 - dy) + bottom * dy;
}

struct TextBox {
  float x = 0;
  float y = 0;
  float width = 0;
  float height = 0;
  float score = 0;
};

Ort::Env &OrtEnvironment() {
  static Ort::Env environment(ORT_LOGGING_LEVEL_WARNING, "tabitomo-local-models");
  return environment;
}

struct OcrSessions {
  Ort::Session detector;
  Ort::Session recognizer;
  std::string detectorInput;
  std::string detectorOutput;
  std::string recognizerInput;
  std::string recognizerOutput;
  std::vector<std::string> characters;

  explicit OcrSessions(const std::string &root)
      : detector(OrtEnvironment(), RequiredFile(root, "det.onnx").c_str(), SessionOptions()),
        recognizer(OrtEnvironment(), RequiredFile(root, "rec.onnx").c_str(), SessionOptions()) {
    Ort::AllocatorWithDefaultOptions allocator;
    detectorInput = detector.GetInputNameAllocated(0, allocator).get();
    detectorOutput = detector.GetOutputNameAllocated(0, allocator).get();
    recognizerInput = recognizer.GetInputNameAllocated(0, allocator).get();
    recognizerOutput = recognizer.GetOutputNameAllocated(0, allocator).get();

    std::ifstream dictionary(RequiredFile(root, "dict.txt"));
    if (!dictionary.is_open()) throw std::runtime_error("Could not open the PP-OCR character dictionary.");
    std::string line;
    while (std::getline(dictionary, line)) {
      if (!line.empty() && line.back() == '\r') line.pop_back();
      characters.push_back(line);
    }
    if (characters.empty()) throw std::runtime_error("The PP-OCR character dictionary is empty.");
  }

  static Ort::SessionOptions SessionOptions() {
    Ort::SessionOptions options;
    options.SetIntraOpNumThreads(2);
    options.SetInterOpNumThreads(1);
    options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    return options;
  }
};

std::mutex gOcrMutex;
std::string gOcrRoot;
std::unique_ptr<OcrSessions> gOcrSessions;

OcrSessions *GetOcrSessions(const std::string &root) {
  if (gOcrSessions == nullptr || gOcrRoot != root) {
    gOcrSessions = std::make_unique<OcrSessions>(root);
    gOcrRoot = root;
  }
  return gOcrSessions.get();
}

std::vector<float> DetectorInput(const ImagePixels &image, int &targetWidth, int &targetHeight) {
  const float scale = std::min(1.0f, 960.0f / std::max(image.width, image.height));
  targetWidth = std::max(32, static_cast<int>(std::round(image.width * scale / 32.0f)) * 32);
  targetHeight = std::max(32, static_cast<int>(std::round(image.height * scale / 32.0f)) * 32);
  std::vector<float> input(static_cast<size_t>(3) * targetWidth * targetHeight);
  constexpr float mean[] = {0.485f, 0.456f, 0.406f};
  constexpr float stddev[] = {0.229f, 0.224f, 0.225f};

  for (int y = 0; y < targetHeight; ++y) {
    const float sourceY = (y + 0.5f) * image.height / targetHeight - 0.5f;
    for (int x = 0; x < targetWidth; ++x) {
      const float sourceX = (x + 0.5f) * image.width / targetWidth - 0.5f;
      const size_t offset = static_cast<size_t>(y) * targetWidth + x;
      const float blue = SampleChannel(image, sourceX, sourceY, 2) / 255.0f;
      const float green = SampleChannel(image, sourceX, sourceY, 1) / 255.0f;
      const float red = SampleChannel(image, sourceX, sourceY, 0) / 255.0f;
      input[offset] = (blue - mean[0]) / stddev[0];
      input[static_cast<size_t>(targetWidth) * targetHeight + offset] = (green - mean[1]) / stddev[1];
      input[static_cast<size_t>(targetWidth) * targetHeight * 2 + offset] = (red - mean[2]) / stddev[2];
    }
  }
  return input;
}

std::vector<TextBox> DetectorBoxes(const float *scores, int mapWidth, int mapHeight, int imageWidth, int imageHeight) {
  const size_t count = static_cast<size_t>(mapWidth) * mapHeight;
  std::vector<uint8_t> visited(count, 0);
  std::vector<TextBox> boxes;
  std::vector<int> pending;
  pending.reserve(4096);
  constexpr float threshold = 0.3f;
  constexpr float boxThreshold = 0.6f;
  const int neighbors[8][2] = {{-1,-1},{0,-1},{1,-1},{-1,0},{1,0},{-1,1},{0,1},{1,1}};

  for (int y = 0; y < mapHeight; ++y) {
    for (int x = 0; x < mapWidth; ++x) {
      const int start = y * mapWidth + x;
      if (visited[start] || scores[start] < threshold) continue;
      pending.clear();
      pending.push_back(start);
      visited[start] = 1;
      int minX = x, maxX = x, minY = y, maxY = y, pixels = 0;
      double scoreSum = 0;

      for (size_t cursor = 0; cursor < pending.size(); ++cursor) {
        const int index = pending[cursor];
        const int currentX = index % mapWidth;
        const int currentY = index / mapWidth;
        minX = std::min(minX, currentX);
        maxX = std::max(maxX, currentX);
        minY = std::min(minY, currentY);
        maxY = std::max(maxY, currentY);
        scoreSum += scores[index];
        ++pixels;
        for (const auto &neighbor : neighbors) {
          const int nextX = currentX + neighbor[0];
          const int nextY = currentY + neighbor[1];
          if (nextX < 0 || nextY < 0 || nextX >= mapWidth || nextY >= mapHeight) continue;
          const int next = nextY * mapWidth + nextX;
          if (!visited[next] && scores[next] >= threshold) {
            visited[next] = 1;
            pending.push_back(next);
          }
        }
      }

      const float average = pixels == 0 ? 0 : static_cast<float>(scoreSum / pixels);
      if (pixels < 4 || average < boxThreshold) continue;
      const float scaleX = static_cast<float>(imageWidth) / mapWidth;
      const float scaleY = static_cast<float>(imageHeight) / mapHeight;
      float left = minX * scaleX;
      float top = minY * scaleY;
      float right = (maxX + 1) * scaleX;
      float bottom = (maxY + 1) * scaleY;
      const float padX = std::max(2.0f, (right - left) * 0.08f);
      const float padY = std::max(2.0f, (bottom - top) * 0.18f);
      left = std::max(0.0f, left - padX);
      top = std::max(0.0f, top - padY);
      right = std::min(static_cast<float>(imageWidth), right + padX);
      bottom = std::min(static_cast<float>(imageHeight), bottom + padY);
      if (right - left < 4 || bottom - top < 4) continue;
      boxes.push_back({left, top, right - left, bottom - top, average});
    }
  }

  std::sort(boxes.begin(), boxes.end(), [](const TextBox &left, const TextBox &right) {
    const float tolerance = std::min(left.height, right.height) * 0.5f;
    if (std::abs(left.y - right.y) <= tolerance) return left.x < right.x;
    return left.y < right.y;
  });
  if (boxes.size() > 100) boxes.resize(100);
  return boxes;
}

std::vector<float> RecognizerInput(const ImagePixels &image, const TextBox &box) {
  constexpr int targetHeight = 48;
  constexpr int targetWidth = 320;
  const float aspect = box.width / std::max(1.0f, box.height);
  const int contentWidth = std::min(targetWidth, std::max(8, static_cast<int>(std::ceil(targetHeight * aspect))));
  std::vector<float> input(static_cast<size_t>(3) * targetHeight * targetWidth, 0.0f);

  for (int y = 0; y < targetHeight; ++y) {
    const float sourceY = box.y + (y + 0.5f) * box.height / targetHeight - 0.5f;
    for (int x = 0; x < contentWidth; ++x) {
      const float sourceX = box.x + (x + 0.5f) * box.width / contentWidth - 0.5f;
      const size_t offset = static_cast<size_t>(y) * targetWidth + x;
      input[offset] = SampleChannel(image, sourceX, sourceY, 2) / 127.5f - 1.0f;
      input[static_cast<size_t>(targetWidth) * targetHeight + offset] = SampleChannel(image, sourceX, sourceY, 1) / 127.5f - 1.0f;
      input[static_cast<size_t>(targetWidth) * targetHeight * 2 + offset] = SampleChannel(image, sourceX, sourceY, 0) / 127.5f - 1.0f;
    }
  }
  return input;
}

struct Recognition {
  std::string text;
  float confidence = 0;
};

Recognition DecodeCTC(const float *values, int steps, int classes, const std::vector<std::string> &characters) {
  Recognition output;
  int previous = -1;
  double confidenceSum = 0;
  int confidenceCount = 0;

  for (int step = 0; step < steps; ++step) {
    const float *row = values + static_cast<size_t>(step) * classes;
    int best = 0;
    float bestValue = row[0];
    double rawSum = row[0];
    bool probabilities = row[0] >= 0 && row[0] <= 1;
    for (int index = 1; index < classes; ++index) {
      rawSum += row[index];
      probabilities = probabilities && row[index] >= 0 && row[index] <= 1;
      if (row[index] > bestValue) {
        best = index;
        bestValue = row[index];
      }
    }
    float probability = bestValue;
    if (!probabilities || rawSum < 0.5 || rawSum > 1.5) {
      double denominator = 0;
      for (int index = 0; index < classes; ++index) denominator += std::exp(row[index] - bestValue);
      probability = static_cast<float>(1.0 / denominator);
    }

    if (best != 0 && best != previous) {
      if (best >= 1 && best <= static_cast<int>(characters.size())) {
        output.text += characters[best - 1];
      } else if (best == static_cast<int>(characters.size()) + 1) {
        output.text += " ";
      }
      confidenceSum += probability;
      ++confidenceCount;
    }
    previous = best;
  }
  output.confidence = confidenceCount == 0 ? 0 : static_cast<float>(confidenceSum / confidenceCount);
  return output;
}

std::vector<std::pair<TextBox, Recognition>> RunOcr(const ImagePixels &image, OcrSessions &sessions) {
  int detWidth = 0, detHeight = 0;
  std::vector<float> detInput = DetectorInput(image, detWidth, detHeight);
  std::array<int64_t, 4> detShape = {1, 3, detHeight, detWidth};
  Ort::MemoryInfo memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
  Ort::Value detTensor = Ort::Value::CreateTensor<float>(
      memory, detInput.data(), detInput.size(), detShape.data(), detShape.size());
  const char *detInputNames[] = {sessions.detectorInput.c_str()};
  const char *detOutputNames[] = {sessions.detectorOutput.c_str()};
  auto detOutputs = sessions.detector.Run(
      Ort::RunOptions{nullptr}, detInputNames, &detTensor, 1, detOutputNames, 1);
  auto detOutputShape = detOutputs[0].GetTensorTypeAndShapeInfo().GetShape();
  if (detOutputShape.size() < 3) throw std::runtime_error("PP-OCR detector returned an unsupported output shape.");
  const int mapHeight = static_cast<int>(detOutputShape[detOutputShape.size() - 2]);
  const int mapWidth = static_cast<int>(detOutputShape[detOutputShape.size() - 1]);
  auto boxes = DetectorBoxes(detOutputs[0].GetTensorData<float>(), mapWidth, mapHeight, image.width, image.height);

  std::vector<std::pair<TextBox, Recognition>> results;
  for (const TextBox &box : boxes) {
    std::vector<float> recInput = RecognizerInput(image, box);
    std::array<int64_t, 4> recShape = {1, 3, 48, 320};
    Ort::Value recTensor = Ort::Value::CreateTensor<float>(
        memory, recInput.data(), recInput.size(), recShape.data(), recShape.size());
    const char *recInputNames[] = {sessions.recognizerInput.c_str()};
    const char *recOutputNames[] = {sessions.recognizerOutput.c_str()};
    auto recOutputs = sessions.recognizer.Run(
        Ort::RunOptions{nullptr}, recInputNames, &recTensor, 1, recOutputNames, 1);
    auto recOutputShape = recOutputs[0].GetTensorTypeAndShapeInfo().GetShape();
    if (recOutputShape.size() != 3) throw std::runtime_error("PP-OCR recognizer returned an unsupported output shape.");
    const int steps = static_cast<int>(recOutputShape[1]);
    const int classes = static_cast<int>(recOutputShape[2]);
    Recognition recognition = DecodeCTC(
        recOutputs[0].GetTensorData<float>(), steps, classes, sessions.characters);
    if (!recognition.text.empty()) results.emplace_back(box, std::move(recognition));
  }
  return results;
}

}  // namespace

@implementation TabitomoLocalModelsBridge

+ (BOOL)isAvailable {
  return YES;
}

+ (BOOL)validateModel:(NSString *)modelId rootPath:(NSString *)rootPath error:(NSError **)error {
  try {
    const std::string id = StdString(modelId);
    const std::string root = StdString(rootPath);
    if (id == "ppocr-v5-mobile") {
      std::lock_guard<std::mutex> lock(gOcrMutex);
      (void)GetOcrSessions(root);
    } else {
      std::lock_guard<std::mutex> lock(gAsrMutex);
      (void)GetAsrRecognizer(id, root, "auto", "transcribe", true);
    }
    return YES;
  } catch (const std::exception &exception) {
    SetError(error, 1, StringFromException(exception));
    return NO;
  }
}

+ (NSString *)transcribeFloat32PCM:(NSData *)pcmData
                        sampleRate:(NSInteger)sampleRate
                           modelId:(NSString *)modelId
                          rootPath:(NSString *)rootPath
                          language:(NSString *)language
                              task:(NSString *)task
                             useITN:(BOOL)useITN
                             error:(NSError **)error {
  try {
    if (pcmData.length == 0 || pcmData.length % sizeof(float) != 0) {
      throw std::runtime_error("The offline speech PCM buffer is empty or invalid.");
    }
    const size_t sampleCount = pcmData.length / sizeof(float);
    if (sampleCount > static_cast<size_t>(std::numeric_limits<int32_t>::max())) {
      throw std::runtime_error("The recording is too long for offline speech recognition.");
    }

    std::lock_guard<std::mutex> lock(gAsrMutex);
    AsrRecognizerHandle *handle = GetAsrRecognizer(
        StdString(modelId), StdString(rootPath), StdString(language), StdString(task), useITN);
    const SherpaOnnxOfflineStream *stream = SherpaOnnxCreateOfflineStream(handle->recognizer);
    if (stream == nullptr) throw std::runtime_error("sherpa-onnx could not create a recognition stream.");
    SherpaOnnxAcceptWaveformOffline(
        stream, static_cast<int32_t>(sampleRate), static_cast<const float *>(pcmData.bytes),
        static_cast<int32_t>(sampleCount));
    SherpaOnnxDecodeOfflineStream(handle->recognizer, stream);
    const SherpaOnnxOfflineRecognizerResult *result = SherpaOnnxGetOfflineStreamResult(stream);
    std::string text;
    if (result != nullptr && result->text != nullptr) text = result->text;
    if (result != nullptr) SherpaOnnxDestroyOfflineRecognizerResult(result);
    SherpaOnnxDestroyOfflineStream(stream);
    return [NSString stringWithUTF8String:text.c_str()] ?: @"";
  } catch (const std::exception &exception) {
    SetError(error, 2, StringFromException(exception));
    return nil;
  }
}

+ (NSArray<NSDictionary<NSString *, id> *> *)recognizeTextAtPath:(NSString *)imagePath
                                                         rootPath:(NSString *)rootPath
                                                            error:(NSError **)error {
  try {
    ImagePixels image = LoadImagePixels(imagePath);
    std::lock_guard<std::mutex> lock(gOcrMutex);
    OcrSessions *sessions = GetOcrSessions(StdString(rootPath));
    auto results = RunOcr(image, *sessions);
    NSMutableArray<NSDictionary<NSString *, id> *> *items = [NSMutableArray arrayWithCapacity:results.size()];
    for (const auto &entry : results) {
      const TextBox &box = entry.first;
      const Recognition &recognition = entry.second;
      NSString *text = [NSString stringWithUTF8String:recognition.text.c_str()];
      if (text.length == 0) continue;
      const double left = box.x;
      const double top = box.y;
      const double right = box.x + box.width;
      const double bottom = box.y + box.height;
      NSArray *location = @[@(left), @(top), @(right), @(top), @(right), @(bottom), @(left), @(bottom)];
      NSArray *rotateRect = @[@(left + box.width / 2), @(top + box.height / 2), @(box.width), @(box.height), @0];
      [items addObject:@{
        @"text": text,
        @"confidence": @(recognition.confidence),
        @"location": location,
        @"rotate_rect": rotateRect,
      }];
    }
    return items;
  } catch (const std::exception &exception) {
    SetError(error, 3, StringFromException(exception));
    return nil;
  }
}

+ (void)unloadModel:(NSString *)modelId rootPath:(NSString *)rootPath {
  const std::string id = StdString(modelId);
  const std::string root = StdString(rootPath);
  if (id == "ppocr-v5-mobile") {
    std::lock_guard<std::mutex> lock(gOcrMutex);
    if (gOcrRoot == root) {
      gOcrSessions.reset();
      gOcrRoot.clear();
    }
  } else {
    std::lock_guard<std::mutex> lock(gAsrMutex);
    if (gAsrKey.find(root) != std::string::npos) {
      gAsrRecognizer.reset();
      gAsrKey.clear();
    }
  }
}

@end
