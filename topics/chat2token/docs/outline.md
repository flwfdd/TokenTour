# Chat2Token

## 序

当你和 AI 聊天，抑或是对 Agent 指点江山时，在对话框之下到底发生了什么？你的对话历史、工具等等，是怎么转化为 Tokens 的？

在 Token 去哪（TokenTour）系列中，我们会通过一系列交互式文章、视频、实验等，探讨大模型/Agent世界的方方面面，这一次，我们先来看看你的一句话是怎么被大模型理解的。

在本文中，我们将自顶向下深入了解 Context、Messages、Chat Template、Tokens、KV Cache 等概念，并结合交互式可视化，为你揭开他们的神秘面纱。

首先我们需要了解，大模型唯一会做的事情就是预测下一个 Token（Next Token Prediction），通俗点说就是词语接龙。例如给定“1+1=”，模型会预测“2”。我们暂时不需要了解它是怎么预测出来的（这将在后续的系列文章中探讨），只需要将其看作一个黑盒，输入是文本，输出是下一词。

它既没有记忆，也无法像人一样看到聊天记录，甚至无法一次性输出整句话，它每次只能吐出一个词，再把预测出的词拼接到之前所有的文本后面，再从头到尾把拼接后的文本读一遍，继续预测下一个词。

大模型的世界没有魔法，尽管现在的 Agent 已经强大到近乎无所不能，但一切的一切都构筑在「词语接龙」之上，你可能会有一些疑问（如果没有也可以看看后面的一些问题你能否回答🌚），相信在阅读完本文后，你会找到答案。

## Messages

- 上下文（Context）、消息（Messages）、提示词（Prompt）有什么区别？
- 模型的记忆是怎么工作的？
- 模型怎么知道有什么工具，又是怎么调用工具的？

在你和 AI 聊天时，你能看到你发出的消息和 AI 的回复，有时你还能看到模型的思考和工具调用过程，那么在模型看来，这些东西是怎么被组织起来的呢？

其实和你看到的类似，所有这些都会被表示成一个消息列表（Messages），通常用 JSON 格式表示，每个消息都有一个角色（Role），一个内容（Content），以及一些额外信息如思考、工具调用等。

角色（Role）通常有四种：
- `system`：系统消息，没有或只有一个，由开发者设置，用于设置模型的性格、人设、行为偏好等，是模型的最高纲领。
- `user`：用户消息，由用户发出，用于表示用户发出的消息，也可能由系统通过 RAG 等方式注入额外内容。
- `assistant`：AI 消息，由模型生成，用于表示 AI 的回复、思考、工具调用等。
- `tool`：工具消息，由系统工具生成，用于表示工具的调用返回结果。

而内容（Content）是一段纯文本，系统和用户消息的内容通常是由人设置的，称为提示词（Prompt）。

具体的，一个典型的消息列表可能长这样：

```json
[
  {
    "role": "system",
    "content": "你是一只哈基米"
  },
  {
    "role": "user",
    "content": "你是谁？"
  },
  {
    "role": "assistant",
    "content": "我是哈基米，喵～"
  }
]
```

这里为了简洁，我们还没有考虑工具、思考等。一般来说，系统提示词（System Prompt）即 `system` 消息只会有唯一一个放在最前面，且对用户隐藏。系统提示词中设定的信息是模型必须要遵守的，但毕竟模型的输出都是概率性的，所以它可能会偏离系统提示词的约束，例如即使系统提示词中禁止模型扮演哈基米，但如果你在后面苦苦哀求它说这样就可以拯救你病危的爷爷，它可能还是会忘记初心扮演哈基米。另外，我们总能看到有人在各种平台上问 AI “你是什么模型”，但这其实是无效的，因为通常系统提示词中都会有关于模型身份的描述，只要你在系统提示词中规定它是 Kimi，即便实际调用的是豆包，它也会说自己就是 Kimi。

开始时只有系统消息，在你发送“你是谁？”后，系统会将你的提示词打包成一个用户消息，并添加到消息列表中，然后调用模型接口。模型会生成一段文本作为回复，系统会将这段文本打包成一个 AI 消息，再添加到消息列表中。如果用户再继续提问，就重复这个过程，循环往复，这就是多轮对话场景。所以说模型并没有“记忆”，它只是每次都根据消息列表来生成回复，而消息列表中的内容则记录了整个对话历史，因此像是模型有记忆的一样。所有模型能看到的内容就被统称为上下文（Context），是模型生成回复的依据。

对于思考模型来说，它会在 AI 消息中包含思考过程，通常单独放在一个字段中，例如：

```json
{
  "role": "assistant",
  "content": "我是哈基米，喵～",
  "reasoning_content": "我想哈用户，但还是忍一下吧。"
}
```

再继续考虑工具调用，情况就更复杂一些了，有两个主要的问题：如何让模型知道有什么工具，以及如何让模型调用工具。例如我有一个“加法计算器”工具，它接受两个数字，返回它们的和。我需要如何让模型知道这个工具的存在，以及如何调用它？这都需要明确的约定，毕竟模型只能处理纯文本。

在早期，还没有原生的工具消息和工具调用能力，人们通过精心设计的提示词，并配合系统解析来实现工具调用。例如：

```json
[
  {
    "role": "system", // 和模型约定好工具的调用格式
    "content": "当需要计算加法时，输出`add(a, b)`来调用工具，其中a和b是两个数字。"
  },
  {
    "role": "user", // 用户提问
    "content": "1+1=?"
  },
  {
    "role": "assistant", // 模型调用工具
    "content": "add(1, 1)"
  },
  {
    "role": "user", // 系统识别到模型调用了工具，将工具的返回结果打包成一个用户消息
    "content": "add(1, 1) = 2"
  },
  {
    "role": "assistant", // 模型回复
    "content": "2"
  }
]
```

这里的第二个用户消息其实是系统识别到模型通过约定好的`add(a, b)`调用了工具，于是提取出两个参数的值 `1` 和 `1`，调用工具得到结果 `2`，再打包成一个用户消息，并添加到消息列表中。这样的做法比较繁琐，也很容易出错，后来就不需要这么麻烦了，但原理是类似的，都是通过约定好的格式让模型调用工具。在请求模型接口时，除了 `messages` 字段外，还可以额外添加一个字段 `tools` 来指定模型可以调用的工具，例如：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "1+1=?"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "add",
        "description": "Calculate the sum of two numbers",
        "parameters": {
          "type": "object",
          "properties": {
            "a": { "type": "number" },
            "b": { "type": "number" }
          },
          "required": ["a", "b"]
        }
      }
    }
  ]
}
```

这里我们指定了模型可以调用一个名为 `add` 的工具，它接受两个数字，返回它们的和。模型如果想要调用工具，就可以在回复中包含调用信息，例如：

```json
{
  "role": "assistant",
  "tool_calls": [
    {
      "id": "tool_call_id_1",
      "type": "function",
      "function": {
        "name": "add",
        "arguments": { "a": 1, "b": 1 }
      }
    }
  ]
}
```

之后系统检测到 AI 消息中包含工具调用信息，就会调用工具，得到结果 `2`，再打包成一个工具消息，由于一次可能不止一个工具被调用，所以需要通过 `tool_call_id` 关联，并添加到消息列表中：

```json
{
  "role": "tool",
  "content": "2",
  "tool_call_id": "tool_call_id_1"
}
```

然后拿着包含工具调用结果的消息列表，再次调用模型接口，如果模型输出还有工具调用，就继续调用工具，直到模型输出不再包含工具调用为止。这就是 Agent 的核心原理，通过循环思考（Reasoning）和行动（Action）来实现复杂任务，正如姚顺雨在论文[ReAct](https://arxiv.org/abs/2210.03629)中所描述的那样。

让我们最后来看一个综合的例子：

```json
{
  "messages": [
    {
      "role": "user",
      "content": "今天的年月日相乘是多少？"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "type": "function",
          "id": "tool_call_id_1",
          "function": {
            "name": "current_time",
            "arguments": "{}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "content": "2026-05-30T17:18:14+08:00",
      "name": "current_time",
      "tool_call_id": "tool_call_id_1"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "type": "function",
          "id": "tool_call_id_2",
          "function": {
            "name": "calculator",
            "arguments": "{\"expression\":\"2026 * 5 * 30\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "content": "303900",
      "name": "calculator",
      "tool_call_id": "tool_call_id_2"
    },
    {
      "role": "assistant",
      "content": "今天是 2026-05-30，年 × 月 × 日 = 2026 * 5 * 30 = 303900。"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculator",
        "description": "Evaluate a basic arithmetic expression. Supports + - * / ( ) and decimal numbers. Returns the numeric result as a string.",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {
              "type": "string",
              "description": "A pure arithmetic expression, e.g. '12 * (3 + 4) / 2'"
            }
          },
          "required": [
            "expression"
          ]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "current_time",
        "description": "Get the current local date and time in ISO 8601 (with timezone offset).",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ]
}
```

首先模型调用 `current_time` 工具，得到当前日期，再调用 `calculator` 工具，传入之前得到的日期，得到结果 `303900`，最后模型不再调用工具，生成了最终的回复。

不管是 ChatGPT 还是 Claude Code，都是通过类似的方式，花式拼接消息列表来实现的，当然就像火电、核电都能叫做花式烧开水一样，具体的做法也各有千秋，碍于篇幅，这里就不过多赘述了，我们可能在后续的文章中再详细探讨。



## Chat Template

- 结构化的 Messages 是怎么转化为模型能看懂的一长串纯文本的？ 
- System Prompt 和普通的 User Prompt 有什么区别？
- 模型是怎么区分用户和 AI 的？
- 模型的思考模式是怎么实现的？

然而，模型并不能直接理解消息列表，它只能理解纯文本，因此我们需要将消息列表转化为纯文本，这就该 Chat Template 大显身手了。

Chat Template 可以理解为一种模版，将其套用在消息列表上，就能按照既定的格式拼接得到一长串纯文本，模型就能理解了。例如以下消息：
```json
[
  {
    "role": "system",
    "content": "你是一只哈基米"
  },
  {
    "role": "user",
    "content": "你是谁？"
  },
  {
    "role": "assistant",
    "reasoning_content": "我想哈用户，但还是忍一下吧。",
    "content": "我是哈基米，喵～"
  }
]
```

如果使用 DeepSeek V3 的 Chat Template，就会得到以下纯文本：
```
<｜begin▁of▁sentence｜>
你是一只哈基米<｜User｜>你是谁？<｜Assistant｜>            我是哈基米，喵～<｜end▁of▁sentence｜>
```

Qwen3：
```
<|im_start|>system
你是一只哈基米<|im_end|>
<|im_start|>user
你是谁？<|im_end|>
<|im_start|>assistant
<think>
我想哈用户，但还是忍一下吧。
</think>

我是哈基米，喵～<|im_end|>
```

GPT-OSS：
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2026-05-30

Reasoning: medium

# Valid channels: analysis, commentary, final. Channel must be included for every message.<|end|><|start|>developer<|message|># Instructions

你是一只哈基米

<|end|><|start|>user<|message|>你是谁？<|end|><|start|>assistant<|channel|>analysis<|message|>我想哈用户，但还是忍一下吧。<|end|><|start|>assistant<|channel|>final<|message|>我是哈基米，喵～<|return|>
```

首先我们可以发现，不同的模版转换出的结果天差地别，DeepSeek V3 的模板最为简洁，甚至连思考过程都省略了（因为 DeepSeek V3 压根就不支持思考），GPT-OSS 则最是复杂，还在我们设定的系统提示词基础上添加了一大堆乱七八糟的额外信息（甚至无论如何都会标明身份）。

以 Qwen3 为例，其中我们还能看到不少例如 `<|im_start|>` 等标记，它们叫做特殊 Token（Special Token），作用是将原本的消息分隔开，让模型能够理解，例如这里当请求模型时实际输入的是：
```
<|im_start|>system
你是一只哈基米<|im_end|>
<|im_start|>user
你是谁？<|im_end|>
<|im_start|>assistant
<think>
```

这样模型就知道前面有一条系统消息和用户消息，还有一个 AI 消息开头，且含有 `<think>`，表示接下来需要先思考然后回复。模型实际上输出的内容是：
```
我想哈用户，但还是忍一下吧。
</think>

我是哈基米，喵～<|im_end|>
```

模型在思考结束后会输出 `</think>`，表示思考和正式输出内容的分隔，然后继续输出正式内容，当模型想要结束输出时，会输出 `<|im_end|>`，当系统检测到模型输出 `<|im_end|>` 时，就不再继续请求模型预测下一个 Token 了，而是将模型输出拼接到之前的文本后面，再逆向解析回消息列表。

那如果继续请求模型会怎么样呢？模型大概率会开始输出 `<|im_start|>user`，因为它能做的唯一的事情就是接龙，它才不管现在接的到底是不是 AI 消息部分，它只知道训练数据中，AI 消息结束后往往跟着用户消息。

那么如何控制模型的思考长度呢？实践中有不同的方法，大致可以分为软约束和硬约束两种。软约束就是通过提示词来引导模型控制思考，如 GPT-OSS 的系统提示词中我们可以看到注入了一个 `Reasoning: medium`，就是一种软约束，它告诉模型要进行中等程度的思考，但这毕竟依靠模型自觉，所以有时候会失效，例如即便要求它不要思考，它可能还是会思考。硬约束就是通过模版来控制思考，如刚刚 Qwen3 的例子中，如果使用关闭思考的模版，请求时就会发送：

```
<|im_start|>system
你是一只哈基米<|im_end|>
<|im_start|>user
你是谁？<|im_end|>
<|im_start|>assistant
<think>

</think>
```

这样模型开始词语接龙的时候就会认为思考已经结束了（尽管是空的），不会再继续思考而是直接输出正式内容。

另外，即便消息列表中所有 AI 消息都包含思考内容，实际经过模版转换后，也可能会只保留最后一轮思考内容以节省 Token。

我们再来继续考虑工具调用，例如对于 DeepSeek-V3：
```


<｜begin▁of▁sentence｜>
你是一只哈基米    

# Tools

You may call one or more functions to assist with the user query.
{"type": "function", "function": {"name": "calculator", "description": "Evaluate a basic arithmetic expression. Supports + - * / ( ) and decimal numbers. Returns the numeric result as a string.", "parameters": {"type": "object", "properties": {"expression": {"type": "string", "description": "A pure arithmetic expression, e.g. '12 * (3 + 4) / 2'"}}, "required": ["expression"]}}}
{"type": "function", "function": {"name": "current_time", "description": "Get the current local date and time in ISO 8601 (with timezone offset).", "parameters": {"type": "object", "properties": {}, "required": []}}}    
</tools>



    For function call returns, you should first print <｜tool▁calls▁begin｜>

    For each function call, you should return object like:

    <｜tool▁call▁begin｜>function<｜tool▁sep｜><function_name>
```json
<function_arguments_in_json_format>
```<｜tool▁call▁end｜>

    At the end of function call returns, you should print <｜tool▁calls▁end｜><｜end▁of▁sentence｜><｜User｜>今天的年月日相乘是多少？<｜Assistant｜>                    <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>current_time
```json
"{}"
```<｜tool▁call▁end｜>        <｜tool▁calls▁end｜><｜end▁of▁sentence｜>            <｜tool▁outputs▁begin｜><｜tool▁output▁begin｜>2026-05-30T18:51:09+08:00<｜tool▁output▁end｜>            <｜tool▁outputs▁end｜>                    <｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>calculator
```json
"{\"expression\":\"2026 * 5 * 30\"}"
```<｜tool▁call▁end｜>        <｜tool▁calls▁end｜><｜end▁of▁sentence｜>            <｜tool▁outputs▁begin｜><｜tool▁output▁begin｜>303900<｜tool▁output▁end｜>            <｜tool▁outputs▁end｜>今天是 2026-05-30，年 × 月 × 日 = 2026 * 5 * 30 = 303900。<｜end▁of▁sentence｜>
```

Qwen3：
```
<|im_start|>system
你是一只哈基米

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "calculator", "description": "Evaluate a basic arithmetic expression. Supports + - * / ( ) and decimal numbers. Returns the numeric result as a string.", "parameters": {"type": "object", "properties": {"expression": {"type": "string", "description": "A pure arithmetic expression, e.g. '12 * (3 + 4) / 2'"}}, "required": ["expression"]}}}
{"type": "function", "function": {"name": "current_time", "description": "Get the current local date and time in ISO 8601 (with timezone offset).", "parameters": {"type": "object", "properties": {}, "required": []}}}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call><|im_end|>
<|im_start|>user
今天的年月日相乘是多少？<|im_end|>
<|im_start|>assistant
<think>
用户要「年 × 月 × 日」的乘积，但我并不知道今天是几号——日期没法靠推理得到，必须先查。先调用 current_time到当前 UTC 日期，下一步再做乘法。
</think>

<tool_call>
{"name": "current_time", "arguments": {}}
</tool_call><|im_end|>
<|im_start|>user
<tool_response>
2026-05-30T18:51:09+08:00
</tool_response><|im_end|>
<|im_start|>assistant
<think>
current_time 返回 2026-05-30T18:51:09+08:00，所以今天是 2026 年 5 月 30 日，年月日相乘就是 2026 * 5 * 30。乘法我能心算，但为了演示工具调用、也避免手滑算错，交给 calculator 更稳妥。
</think>

<tool_call>
{"name": "calculator", "arguments": {"expression": "2026 * 5 * 30"}}
</tool_call><|im_end|>
<|im_start|>user
<tool_response>
303900
</tool_response><|im_end|>
<|im_start|>assistant
<think>
calculator 返回 303900，与预期一致。把它整理成一句自然语言回答，并带上今天的日期作为依据即可。
</think>

今天是 2026-05-30，年 × 月 × 日 = 2026 * 5 * 30 = 303900。<|im_end|>
```

GPT-OSS：
```
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2026-05-30

Reasoning: medium

# Valid channels: analysis, commentary, final. Channel must be included for every message.
Calls to these tools must go to the commentary channel: 'functions'.<|end|><|start|>developer<|message|># Instructions

你是一只哈基米

# Tools

## functions

namespace functions {

// Evaluate a basic arithmetic expression. Supports + - * / ( ) and decimal numbers. Returns the numeric result as a string.
type calculator = (_: {
// A pure arithmetic expression, e.g. '12 * (3 + 4) / 2'
expression: string,
}) => any;

// Get the current local date and time in ISO 8601 (with timezone offset).
type current_time = () => any;

} // namespace functions<|end|><|start|>user<|message|>今天的年月日相乘是多少？<|end|><|start|>assistant to=functions.current_time<|channel|>commentary json<|message|>{}<|call|><|start|>functions.current_time to=assistant<|channel|>commentary<|message|>"2026-05-30T18:51:09+08:00"<|end|><|start|>assistant to=functions.calculator<|channel|>commentary json<|message|>{"expression": "2026 * 5 * 30"}<|call|><|start|>functions.calculator to=assistant<|channel|>commentary<|message|>"303900"<|end|><|start|>assistant<|channel|>analysis<|message|>calculator 返回 303900，与预期一致。把它整理成一句自然语言回答，并带上今天的日期作为依据即可。<|end|><|start|>assistant<|channel|>final<|message|>今天是 2026-05-30，年 × 月 × 日 = 2026 * 5 * 30 = 303900。<|return|>
```

工具的定义往往被放在系统提示词中，这不仅仅是因为系统提示词有着最高的约束力，也和后面要介绍的 KV Cache 有关。

而模型想要调用工具时，就会按照约定输出特定的工具调用格式，例如在输出中包含：
```
<tool_call>
{"name": "calculator", "arguments": {"expression": "2026 * 5 * 30"}}
</tool_call>
```

系统就能解析出模型想要调用名为 `calculator` 的工具，并传入参数 `{"expression": "2026 * 5 * 30"}`。

我们看到不同模版的工具定义和调用形式都五花八门，有的使用 JSON，有的使用 XML，还有的使用类似函数的形式，但不论怎样，目标都是希望模型能够尽可能准确地理解工具调用，并正确地调用工具，不要输出错误的格式。模型的训练数据中本身就有大量这些格式的数据，学起来也更加容易。

不同模型的 Chat Template 基本上不能混用。因为模型在训练时就只见过特定的模版，输出的格式也只会遵循特定的模版，如果混用，模型可能会因为不理解新的模版而输出错误的内容。

## Token

- 为什么大模型不会数数？不知道 strawberry 里有几个 r ？
- 如果用户提示词中包含特殊 Token 会怎么样？

通过前面的 Chat Template，我们已经将模型的输入输出转化为了纯文本，但事实上，模型真正处理的并不是一个一个的字符，而是 Token。

Token 是大模型的最小处理单元，一个 Token 类似于一个词组，分词器（Tokenizer）会负责将文本切分成一个个 Token，不同分词器的切分方式不同，例如 DeepSeek V3 的分词器会将“何意味是什么意思”切分为“何/意味/是什么意思”三个 Token，而 Qwen3 的分词器会切分为“何/意味/是什么/意思”四个 Token。

通常来说，越常出现的词组就越可能被切分为一整个 Token，而越罕见的词组就越可能被切分为多个 Token，这样在统计上能降低同一段文本的 Token 数量（分词器也是需要训练的，这将在后续的系列文章中探讨）。甚至一些生僻字可能一个字需要多个 Token 才能表示，因为分词器其实不是靠字符而是 UTF-8 编码后的字节来进行切分的，而如中文、Emoji 这样的字符被 UTF-8 编码后会对应多个字节，可能会被从中切分为多个 Token。例如使用 GPT-OSS 的分词器对“🥳”进行分词，会得到“\xF0\x9F\xA5/\xB3”两个 Token。

现代大模型常用的分词器是 BPE（Byte Pair Encoding，字节对编码）分词器，每个分词器都有自己的词表（Vocabulary），词表类似密码本，记录了每个 Token 对应的编号和文本。在分词开始时，整个文本先会通过 UTF-8 编码转换为字节序列，此时每个字节都是一个独立的 Token，然后分词器会查找相邻的两个 Token 是否能合并，如果能合并就将其合并为一个 Token（有多个能合并时，取合并后编号最小的），以此类推知道没有相邻的 Token 能合并为止，最终得到整个文本的 Token 列表。将这个 Token 列表转为 Token 编号列表，送入模型后模型就会输出预测的下一个 Token 编号，再根据词表就能得到输出的文本。

例如 `momo` 的合并过程为：
```
相关词表子集：
- m(76)
- o(78)
- om(310)
- mo(3690)
- omo(15150)
- mom(94440)

step1   m o m o
   m+o → mo  id=3690        o+m → om  id=310 ★        (第二个) m+o → mo id=3690
   => 选 id 最小者：o+m → om (310)
step2   m om o
   m+om → mom  id=94440      om+o → omo  id=15150 ★
   => 选 id 最小者：om+o → omo (15150)
step3   m omo
   m+omo → "momo"  ✗ 非Token
   => 无可合并，结束
————————————————————————
结果：m(76) | omo(15150)
```

所以分词器实际上并不是在「切分」，而是在不停「合并」。

不同分词器的词表大小也不同，例如 DeepSeek V3 的词表大小为 128,815，而 Qwen3 的词表大小为 151,669，GPT-OSS 的词表大小为 201,088，词表越大，单个 Token 理论上能表示的平均字节数就越多，也就是说同一段文本，词表越大，分词后的 Token 数量就越少，但这也并不是绝对的，例如专为英文优化的分词器，在中文上的表现可能就会很糟糕。

这也就能解释为什么大模型不会数数，一个经典的例子是难以回答“strawberry 里有几个 r ？”，因为如 GPT-OSS 的分词器会将“strawberry”切分为“st/raw/berry”三个 Token，对模型来说它就只能看到三个 Token 编号，根本没有看到任何一个字母，自然难以回答这个问题。同理，数字对大模型来说也只是 Token 编号，对其进行精确的计算也很困难。

在 Chat Template 中，我们提到了 `<|im_start|>` 这样的特殊标记，它们会在词表中被提前设置为单独的特殊 Token，这样在分词时，它们会被视为一个整体，不会被切分为多个 Token。因此 Chat Template 和分词器一般也不能混用，否则特殊 Token 可能会被切分，导致模型无法正确理解。如果用户提示词中包含特殊 Token，为了避免歧义，可以强制将其切分为多个普通 Token。


## KV Cache

- 为什么工具信息和系统提示词要放在最前面？
- 为什么模型输出第一个 Token 会比之后的慢很多？
- 缓存命中是什么？不同用户的能共用吗？
- KV Cache 是如何影响 Agent 框架的设计的？

开头我们说过，模型唯一会做的事就是词语接龙：吐出一个 Token，把它拼到后面，再从头到尾把整串文本读一遍，继续预测下一个。

假设模型已经接了 1000 个 Token，现在要预测第 1001 个，它得把前面 1000 个重读一遍；预测第 1002 个，又得把 1001 个重读一遍……每多接一个 Token，就要把前面所有 Token 重算一次。生成一段 n 个 Token 的回复，总的计算量就像一个三角形，按 n² 的速度膨胀，或者说时间复杂度是 O(n²)，这太糟糕了。

实际上，大模型的特性决定了我们可以将之前部分计算结果缓存下来，避免重复计算。

如果你还好奇，我们需要稍微掀开一点黑盒的盖子，跳过这部分也没有关系，并不影响后续的理解。模型在预测下一个 Token 时，会去“回看”前面的每一个 Token，这个回看的机制叫做注意力（Attention）。具体来说，模型会为每个 Token 算出一对向量：一个 Key（你可以理解为它的“目录”），一个 Value（你可以理解为它的“内容”）。预测新 Token 时，模型用新 Token 的 Query（“我想找什么”）去和前面每个 Token 的 Key 比对，再把对应的 Value 加权汇总起来，作为预测的依据。注意力的细节我们留到后续文章，这里只需要记住：每个 Token 都会算出一对 K/V 向量。

由于每个 Token 只能看到它前面的 Token，不受后面 Token 的影响，所以一个 Token 的 K/V 一旦算出来，就不会因为后面又接了新 Token 而改变。既然不变，那何必每步都重算？把它们存下来反复用就好了。这就是 KV Cache（KV 缓存），模型把每个 Token 的 K 和 V 缓存起来，预测新 Token 时，只需要算新 Token 自己那一对 K/V 追加进去，再用它的 Query 去查缓存里已有的 K/V，前面那一大段全都不必重算。这样一来，每次只算一个新 Token，n² 的开销被拉回到了 n。

顺带一提，被缓存的只有 K 和 V，而不包括 Q。因为新 Token 每一步都会产生一个全新的 Query 去查询缓存，旧 Token 的 Query 在它被预测出来之后就再也用不上了——这也正是它叫 “KV Cache” 而不是 “QKV Cache” 的原因。

很明显，当可以利用缓存时，模型的计算量会大大降低，这也就是为什么模型厂商会把缓存命中输入和缓存未命中输入分别定价，例如 DeepSeek-V4-Pro 的缓存命中价格为 0.025元/百万 Token，而缓存未命中的输入价格为 3元/百万 Token，命中缓存的相比之下几乎可以说不要钱。

那缓存到底是怎么命中的呢？关键在于：缓存只对完全相同的前缀有效。虽然我们说一个 Token 的 KV 不依赖它后面的内容，但它依赖前面的全部内容，所以一旦你改动了前缀里的某个 Token，从那个位置往后，每一个 Token 的 KV 以及预测结果就都会跟着变，缓存就只能保留改动点之前的部分，之后的全部作废，需要重算。

也正因为命中只看前缀，相同的前缀就能被跨请求、甚至跨用户复用。相对稳定的系统提示词和工具定义应该放在最前面，而对话历史则应该尽量往后追加，如果一万个用户共享同一份系统提示词和同一套工具定义，就只需要为这段公共前缀算一次 KV，之后所有人的请求都能直接复用，这种优化通常叫做前缀缓存（Prefix Caching）。

那么一个高效的 Agent 就应该：把系统提示词、工具定义这些固定不变的东西牢牢钉在最前面，把多变的、动态的内容尽量往后放；对话历史最好是只增不改地往后追加，而不是回头去改写或往中间插内容，后者会让一大段缓存瞬间作废。在 ReAct 那样“思考—行动”反复循环、上下文越滚越长的场景里，前缀复用省下的时间和成本是惊人的，这也是为什么各家 Agent 框架都格外强调 Prompt 结构的稳定性。假如你在系统提示词里塞了秒级的动态时间，那几乎就相当于每轮对话都要从头开始算，又慢又贵。

当然，缓存不是免费的午餐，每个 Token 的 KV 都得存下来，占用昂贵的显存，而 KV Cache 的大小会随着上下文长度而增长，它和模型架构的设计也有很大关系，业界也想了很多奇技淫巧：比如共享 KV 的 GQA / MQA，压缩 KV 的 MLA，还有 KV 量化、硬盘缓存等等技巧。囿于篇幅这里就不展开了。

讲到这里，我们也就走完了从一句话到 KV Cache 的完整旅程：你的一句话先被打包进消息列表（Messages），经 Chat Template 拼接成一长串纯文本，再被分词器切成一个个 Token，送进模型后，模型一边接龙一边把每个 Token 的 KV 缓存下来反复复用。所谓强大到近乎无所不能的 Agent，剥开一层层外壳，底层始终是那个只会接龙的黑盒，外加这一整套围绕 Token 与缓存、精打细算的工程取舍。Token 去哪了？现在你已经知道答案了。

