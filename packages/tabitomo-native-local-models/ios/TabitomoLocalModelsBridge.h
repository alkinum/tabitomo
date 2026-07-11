#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface TabitomoLocalModelsBridge : NSObject

+ (BOOL)isAvailable;

+ (BOOL)validateModel:(NSString *)modelId
             rootPath:(NSString *)rootPath
                error:(NSError **)error;

+ (nullable NSString *)transcribeFloat32PCM:(NSData *)pcmData
                                  sampleRate:(NSInteger)sampleRate
                                     modelId:(NSString *)modelId
                                    rootPath:(NSString *)rootPath
                                    language:(NSString *)language
                                        task:(NSString *)task
                                       useITN:(BOOL)useITN
                                       error:(NSError **)error;

+ (nullable NSArray<NSDictionary<NSString *, id> *> *)recognizeTextAtPath:(NSString *)imagePath
                                                                  rootPath:(NSString *)rootPath
                                                                     error:(NSError **)error;

+ (void)unloadModel:(NSString *)modelId rootPath:(NSString *)rootPath;

@end

NS_ASSUME_NONNULL_END
