# Cloud OCR 供应商与覆盖翻译适配

最后更新：2026-07-11

## 当前产品契约

tabitomo 当前只适配阿里云 Model Studio / DashScope 的 Qwen-OCR Cloud API。Web 和 Mobile 使用原生多模态生成接口的 `advanced_recognition` 任务，不把普通 OpenAI-compatible VLM 提示词输出当作可靠 OCR 坐标。

- 默认模型：`qwen3.5-ocr`
- 兼容模型：`qwen-vl-ocr-latest`
- 结构化结果：`output.choices[].message.content[].ocr_result.words_info`
- 覆盖翻译几何：每行 `location` 为原图绝对四点坐标，`rotate_rect` 为旋转矩形
- 公共地域：北京与新加坡；企业 Workspace 可输入对应地域的完整原生 OCR endpoint
- 凭据：只接受阿里云 Model Studio / DashScope API key
- Web：2026-07-11 对北京、新加坡公共原生 endpoint 的 OPTIONS 与 401 响应实测均返回请求 Origin 的 CORS 允许头

官方资料：

- [Qwen-OCR 模型与任务](https://help.aliyun.com/zh/model-studio/qwen-vl-ocr)
- [Qwen-OCR API 参考](https://help.aliyun.com/zh/model-studio/qwen-vl-ocr-api-reference)
- [Qwen-OCR English documentation](https://www.alibabacloud.com/help/en/model-studio/qwen-vl-ocr)

## 后续供应商候选

这些供应商尚未在 tabitomo 中适配。只有完成认证、请求适配、坐标归一化、错误态、Web/Mobile smoke 和真实图片 QA 后，才能进入设置页。

| 优先级 | 供应商 | 坐标能力 | 覆盖翻译适用性 | 主要接入成本 |
| --- | --- | --- | --- | --- |
| 1 | Google Cloud Vision | `textAnnotations.boundingPoly.vertices`，Document Text 也提供页面/块/段/词层级 geometry | 高；可归一为四点 polygon | Google API key/OAuth、配额与浏览器密钥限制 |
| 2 | Azure AI Vision Read | 行/词 polygon、文本与 confidence | 高；行级 polygon 适合 overlay | Azure endpoint/key、异步/版本差异、区域配置 |
| 3 | AWS Textract DetectDocumentText | LINE/WORD 的 `Geometry.BoundingBox`、`Geometry.Polygon`、`RotationAngle` | 高；文档和票据强 | 客户端需要 SigV4；更适合后端签名代理，BYOK 移动端复杂 |
| 4 | Mistral OCR 3 | paragraph bounding boxes 与 structural block labels | 中；更适合文档块，不一定适合菜单逐行覆盖 | 需要验证行/词粒度、图片场景坐标稳定性 |

官方资料：

- [Google Cloud Vision OCR](https://cloud.google.com/vision/docs/ocr)
- [Google Images annotate REST](https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate)
- [Azure Image Analysis Read OCR](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/how-to/call-read-api)
- [AWS Textract DetectDocumentText](https://docs.aws.amazon.com/textract/latest/dg/API_DetectDocumentText.html)
- [Mistral Document AI OCR](https://docs.mistral.ai/capabilities/document_ai/basic_ocr/)

## 统一 adapter 验收要求

新增供应商必须输出 tabitomo 的统一行级结构：`text`、可选八值四点 `location`、可选五值 `rotate_rect`。坐标必须映射到上传前原图像素空间；若供应商返回归一化坐标、页面坐标或不同顶点顺序，adapter 负责转换。缺少可靠 geometry 的文本只能用于纯文本结果，不得伪造覆盖位置。

每个 adapter 至少覆盖：空图、旋转文字、多语言菜单、长票据、无文字、部分 geometry、认证失败、限流、超时、取消请求，以及 Web 390x844 / 320x720、iOS mock-provider 与真实图片对比。
