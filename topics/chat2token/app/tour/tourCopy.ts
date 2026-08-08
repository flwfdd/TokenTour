import type { Lang } from "../locale";
import type { TourId } from "./tourIds";

// Keep titles/labels aligned with playground UI (terminology skill).
// When changing step counts, update buildTourSteps.ts in the same change.

type StepCopy = { title: string; description: string };

export const tourCopy: Record<
  Lang,
  Record<TourId, { steps: StepCopy[] }>
> = {
  en: {
    messages: {
      steps: [
        {
          title: "Messages",
          description:
            "This left column is the live conversation. Next you will open the full message list as JSON.",
        },
        {
          title: "View JSON",
          description:
            "Click “View JSON” to inspect the structured Messages list the rest of the playground is built from.",
        },
        {
          title: "Edit a message",
          description:
            "Close the JSON modal if it is open, then click a message and edit it. Chat Template, Tokens, and Context × KV Cache update immediately.",
        },
      ],
    },
    "chat-template": {
      steps: [
        {
          title: "Chat Template panel",
          description:
            "This pane shows the plain-text string produced by the model family’s chat template.",
        },
        {
          title: "Switch template family",
          description:
            "Use this selector to switch among Qwen3, DeepSeek-V3, and GPT-OSS and compare how the same Messages render.",
        },
        {
          title: "Hover a fragment",
          description:
            "Hover any colored fragment here. Matching tokens and messages light up across panels.",
        },
      ],
    },
    tokens: {
      steps: [
        {
          title: "Tokens panel",
          description:
            "This pane splits the chat-template text into real tokenizer pieces.",
        },
        {
          title: "Switch tokenizer",
          description:
            "Try Qwen3, DeepSeek-V3, GPT-OSS, and other tokenizers. Watch token boundaries and vocabulary size change.",
        },
        {
          title: "Hover a Token",
          description:
            "Hover a token chip to highlight where it came from in the Chat Template pane.",
        },
      ],
    },
    "kv-cache": {
      steps: [
        {
          title: "Context × KV Cache",
          description:
            "This pane paints the whole context as cached input / uncached input / output regions.",
        },
        {
          title: "Three-color bar",
          description:
            "Each cell is a token (bucketed when long). Colors are cached input, uncached input, and output.",
        },
        {
          title: "Edit an early message",
          description:
            "Edit a message near the start of the conversation. The cached-input region should shrink; restore the text and the hit returns.",
        },
        {
          title: "Imaginary architecture",
          description:
            "Switch model architectures here to compare KV memory footprint per Token. This does not change the API model you call.",
        },
      ],
    },
  },
  zh: {
    messages: {
      steps: [
        {
          title: "消息",
          description: "左侧是实时对话。下一步会打开完整 Messages 的 JSON 视图。",
        },
        {
          title: "查看 JSON",
          description: "点「查看 JSON」，看看下游面板所依赖的结构化消息列表。",
        },
        {
          title: "编辑一条消息",
          description:
            "如已打开 JSON 弹窗请先关掉，然后编辑任意一条消息。Chat Template、Tokens、Context × KV Cache 会立刻更新。",
        },
      ],
    },
    "chat-template": {
      steps: [
        {
          title: "Chat Template 面板",
          description: "这里显示由模型家族 Chat Template 渲染出的纯文本。",
        },
        {
          title: "切换模板家族",
          description: "用这个选择器在 Qwen3 / DeepSeek-V3 / GPT-OSS 之间切换，对比同一组 Messages 的渲染差异。",
        },
        {
          title: "悬停片段",
          description: "把鼠标悬停在任意色块上，其它面板里对应的 token / 消息会一起高亮。",
        },
      ],
    },
    tokens: {
      steps: [
        {
          title: "Tokens 面板",
          description: "这里把 Chat Template 文本切成真实分词器的 Token。",
        },
        {
          title: "切换分词器",
          description: "切换 Qwen3 / DeepSeek-V3 / GPT-OSS 等分词器，观察切分边界与词表大小变化。",
        },
        {
          title: "悬停 Token",
          description: "悬停某个 Token chip，会在 Chat Template 里高亮它的来源片段。",
        },
      ],
    },
    "kv-cache": {
      steps: [
        {
          title: "Context × KV Cache",
          description: "底部面板把整段上下文画成缓存命中输入 / 缓存未命中输入 / 输出区域。",
        },
        {
          title: "三色条",
          description: "每个格子对应一个 token（过长会桶化）。颜色分别是缓存命中输入、缓存未命中输入、输出。",
        },
        {
          title: "编辑靠前的消息",
          description: "编辑对话靠前的消息，「缓存命中输入」区域会缩短；改回原文后又会恢复。",
        },
        {
          title: "假想架构",
          description: "切换假想架构可对比每 Token 的 KV 占用量级；它与真正调用的 API 模型解耦。",
        },
      ],
    },
  },
};
