// Voice registry — safe for client-side use (no Node.js imports)

export const CHINESE_VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓 (女·温暖)", gender: "female" },
  { id: "zh-CN-XiaoyiNeural", label: "晓依 (女·活泼)", gender: "female" },
  { id: "zh-CN-XiaohanNeural", label: "晓涵 (女·知性)", gender: "female" },
  { id: "zh-CN-XiaomoNeural", label: "晓墨 (女·成熟)", gender: "female" },
  { id: "zh-CN-XiaoruiNeural", label: "晓睿 (女·沉稳)", gender: "female" },
  { id: "zh-CN-XiaoshuangNeural", label: "晓双 (女·童声)", gender: "female" },
  { id: "zh-CN-XiaoxuanNeural", label: "晓萱 (女·温柔)", gender: "female" },
  { id: "zh-CN-XiaozhenNeural", label: "晓甄 (女·端庄)", gender: "female" },
  { id: "zh-CN-XiaomengNeural", label: "晓梦 (女·甜美)", gender: "female" },
  { id: "zh-CN-YunxiNeural", label: "云希 (男·阳光)", gender: "male" },
  { id: "zh-CN-YunjianNeural", label: "云健 (男·磁性)", gender: "male" },
  { id: "zh-CN-YunyangNeural", label: "云扬 (男·新闻)", gender: "male" },
  { id: "zh-CN-YunhaoNeural", label: "云皓 (男·标准)", gender: "male" },
  { id: "zh-CN-YunfengNeural", label: "云枫 (男·沉稳)", gender: "male" },
] as const;

export const DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
