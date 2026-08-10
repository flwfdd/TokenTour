<p align="right">
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="public/cover.webp" alt="TokenTour · From Agent Messages to Tokens and KV Cache" width="820">
</p>

<h1 align="center">TokenTour</h1>

<p align="center">
  A vertical cross-section of the LLM application stack—from Agent messages to tokens and KV cache.
</p>

<p align="center">
  <a href="https://tokentour.flwfdd.xyz/chat2token">Read the explorable</a> ·
  <a href="https://tokentour.flwfdd.xyz/chat2token/playground">Open the playground</a>
</p>

LLM applications look simple from the outside, but a single turn passes through many layers: Agent messages, chat templates, tokenization, the context window, attention, and KV cache. Each layer has its own representation, and the connections between them are easy to lose.

TokenTour makes a **vertical cut through that stack**. Instead of explaining one layer in isolation, it follows the same conversation downward and shows how a change at one level propagates through the rest.

The first explorable, **Chat to Token**, combines a guided article with a synchronized playground. Edit a conversation and inspect how it becomes model input, how that input is tokenized, and what it means for context usage and KV cache reuse.

<p align="center">
  <a href="https://tokentour.flwfdd.xyz/chat2token/playground">
    <img src="public/playground_screenshot.webp" alt="TokenTour playground showing a conversation alongside its chat template, tokens, context, and KV cache" width="1000">
  </a>
</p>

## What you can explore

- **Messages → chat template**: compare how model families such as Qwen3, DeepSeek-V3, and GPT-OSS serialize the same conversation and tool calls.
- **Text → tokens**: inspect token boundaries, byte-level behavior, and how small edits change the sequence.
- **Tokens → context and KV cache**: see causal attention, estimate KV memory, and visualize which prefix could be reused on the next turn.
- **Cross-layer tracing**: hover or select an item to follow the corresponding region across the synchronized views.

The playground includes prepared Agent traces, so no API key is needed. You can also bring your own provider and key to generate a trace in the browser. Keys are stored locally in your browser and are not persisted by TokenTour.

## Scope

TokenTour is an explanatory model, not an inference engine. Tokenization uses real model tokenizers where available, and KV memory is calculated from model architecture parameters. Attention cells and prefix-cache states are visual explanations of those mechanisms; they are not provider telemetry or real model activations.

The interface defaults to English. Use the language switch in the top-right corner for Chinese.

For local setup, deployment, and implementation notes, see [Development](./docs/DEVELOPMENT.md). For a detailed walkthrough of the playground, see [Playground Guide](./docs/GUIDE.md).
