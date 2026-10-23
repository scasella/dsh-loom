# 配置 Loom

[English](configuration.md) | 中文

[安装独立 Web bundle](../README.zh.md#install) 后，可使用本参考调整配置。安装、配置和启动时请保持相同的 `DSH_HOME`。支持的运行时版本和现有 profile 的迁移方式见[兼容性说明](../COMPATIBILITY.md)。

## 应用 profile overlay

将以下内容保存为 `loom-config.overlay.yml`。它限制手动分支的启动数量和自主探索预算，并默认启用 worktree 隔离。Worktree 需要至少有一次提交的 Git 仓库和 workspace-write 权限；希望分支使用源目录时，改用 `shared`。

```yaml
- id: loom
  config:
    defaultIsolation: worktree
    maxBranchesPerRequest: 4
    maxConcurrentBranches: 2
- id: tool-loom
  config:
    autoloom:
      maxBranches: 4
      maxDepth: 2
      maxOwnTokens: 100000
      childPermissionPreset: loom-child
```

通过原始 Harness 命令启动：

```sh
dsh web --patch /absolute/path/loom-config.overlay.yml --no-open --port 3097
```

补丁会替换目标条目的整个 `config`；省略的字段采用 schema 默认值。请将现有自定义字段一起复制到替换配置中。自定义 `tool-loom` 配置时请保留 `childPermissionPreset: loom-child`：插件 schema 默认使用 `auto`，本 bundle 则显式指定 `loom-child`。通过 Settings 配置模型凭据；不要将密钥写入 overlay 或共享示例。

在配置档安装时，固定的 `@deepseek-ai/cordis@4.0.5` peer 依赖可能产生 pnpm peer 警告。仅有警告不表示安装失败；请确认 `dsh plugin --profile web list` 包含 Loom，且 Web 已就绪。请勿绕过运行时或 SDK 版本拒绝。

## 分支和工作区更改

以下字段属于 `loom` 条目。[用户指南](guide.zh.md#compare) 介绍了 Apply、Adopt 和 Discard。

| 配置键 | 默认值 | 作用 |
|---|---|---|
| `maxBranchesPerRequest` | `8` | 每次手动分支请求的子分支上限；超出时在创建 fork 前拒绝。 |
| `maxConcurrentBranches` | `4` | 所有分支集中正在创建或运行首次提示的子分支总数上限。 |
| `retainedBranchSets` | `256` | Host 内存中保留的已完成分支集数量；优先淘汰最早创建的已完成分支集。 |
| `defaultIsolation` | `shared` | `shared` 使用源目录；`worktree` 为每个子分支创建独立 checkout。 |
| `concurrentWritableBranches` | `false` | 同目录的可写共享分支依次启动；隔离分支和只读分支不受此限制。 |
| `worktreeBranchPrefix` | `loom/` | Loom 所有的 worktree 分支和目录名称前缀。 |
| `diff.maxBytes` | `262144` | 返回的统一 diff 的 UTF-8 字节数上限。 |
| `apply.maxPatchBytes` | `33554432` | Apply 在写入前检查的二进制补丁字节数上限。 |
| `outcomes.commandTools` | `[{ name: bash, commandArgument: command }]` | Compare 将哪些工具自身结果的可见文本视为命令输出。 |
| `outcomes.testSummary` | unittest、pytest、Vitest、Jest 模式 | 从命令文本解析摘要和计数的正则表达式；没有匹配不表示成功。 |

随 bundle 提供的 worktree 服务与其他 worktree provider 隔离。其条目 ID 为 `loom-worktree`，默认目录池位于源仓库内的 `.agents/worktrees`。Worktree 携带已跟踪文件的更改，不包含未跟踪和忽略的文件，也不会安装依赖。Apply 要求源 checkout 干净；Adopt 保留历史且不会移除 checkout。

## 标价

默认不提供价格。仅为需要计价的路由在 `loom.config.pricing` 中添加条目，并使用提供商的当前价格。条目必须精确匹配请求中记录的 provider 和 model ID。缺少已配置价格或完整用量时，费用显示无法给出美元金额。

| 价格条目键 | 必填值 |
|---|---|
| `provider` | 已注册的 provider 路由 ID。 |
| `model` | 该路由使用的模型 ID。 |
| `inputMissPerMTok` | 每百万未缓存输入和缓存写入 token 的美元价格。 |
| `inputHitPerMTok` | 每百万缓存读取 token 的美元价格。 |
| `outputPerMTok` | 每百万输出 token 的美元价格，包含推理 token。 |

三项价格均须为有限的非负数。空路由 ID 或重复的 provider/model 条目会导致插件加载被拒绝。美元金额是标价估算，不是账户余额或账单。共享前缀调度不保证缓存命中。

## 自主探索

以下字段属于 `tool-loom`。随 bundle 提供的 `loom-child` preset 使用 `sandbox: read-only` 和 `approval: never`。如果其他 overlay 替换了 `permission.config.presets`，请保留该 profile 使用的所有 preset，包括 `loom-child`。

| 配置键 | 本 bundle 中的默认值 | 作用 |
|---|---|---|
| `autoloom.maxBranches` | `8` | 单个 weaver Session 可启动的子分支数量上限。 |
| `autoloom.maxDepth` | `2` | 子分支代数上限；首次展开为第一代。 |
| `autoloom.maxOwnTokens` | `2000000` | 子分支自身输入、缓存和输出 token 的总量。 |
| `autoloom.maxUsd` | 省略 | 可选的有限正数标价美元预算；所有选中路由都须配置价格并具备可计价估算。 |
| `autoloom.childPermissionPreset` | `loom-child` | 在每个子分支首次提示前应用；其审批策略须为 `never`。 |
| `defaultWaitMs` / `maxWaitMs` | `120000` / `1800000` | `loom_wait` 的默认和最长等待时间，单位为毫秒。 |
| `defaultReadChars` / `maxReadChars` | `4000` / `20000` | `loom_read` 的默认和最大输出字符数。 |

子分支请求人工回答或审批时，会立即返回已记录的错误；子分支可以在最终回答中说明缺少的决策。展开操作在创建 fork 前检查预算。已结算的自身用量超出 token 或美元预算时，用量监视器会停止子分支；最后一次响应可能超出预算。自主预算和排队中的分支启动状态保存在 Host 内存中，重启后重置。具体操作见[autoloom 流程](guide.zh.md#autoloom)。

<a id="weave-provider-setup"></a>
## Weave 提供商设置

固定版本的 Pi 目录不会声明 Loom 的可选生成能力。选择目录模型或切换模型选择器无法启用这些能力。请在 `loom-compat-llm-pi-ai` overlay 中为准确的模型声明 `assistantPrefill`；使用概率控件时还须声明 `tokenLogprobs`。这些声明需要 `openai-completions` 协议；本 bundle 的 Anthropic Messages 和 OpenAI Responses 路由不支持这些 Loom 控件。

| 路由 | 前缀声明 | 证据与限制 |
|---|---|---|
| DeepSeek 官方 beta，`deepseek-flash` | `deepseek-prefix` | [官方前缀指南](https://api-docs.deepseek.com/guides/chat_prefix_completion/)要求使用 beta 端点及前缀标记。[Chat API](https://api-docs.deepseek.com/api/create-chat-completion)记录了回答 logprobs。序列化已有无密钥测试；本次审查未进行有余额的官方 API 调用。 |
| OpenRouter，`deepseek/deepseek-v4.1-flash-1017`，固定使用 `deepseek` 提供商 | `trailing-message` | 独立版验收运行曾在此路由记录续写与概率。这是针对特定路由的证据，不保证其他 OpenRouter 模型、提供商或后续路由可用。 |

使用官方路由时，请将以下提供商合并到 overlay 中，保留所有现有提供商，因为 patch 会替换完整的 `config`。在 Harness 凭证中按指定引用保存密钥，或使用私有启动环境；示例中没有密钥。重启后，在 Weave 模型选择器中选择 **DeepSeek Weave → deepseek-flash**。

```yaml
- id: loom-compat-llm-pi-ai
  config:
    providers:
      loom-deepseek-beta:
        displayName: DeepSeek Weave
        apiKeyEnv: DEEPSEEK_API_KEY
        api: openai-completions
        baseURL: https://api.deepseek.com/beta
        compat:
          thinkingFormat: deepseek
        models:
          - id: deepseek-flash
            assistantPrefill: deepseek-prefix
            tokenLogprobs:
              maxTopLogprobs: 20
            reasoningEfforts:
              off:
              high: high
```

使用曾测试的 OpenRouter 路由时，请设置 `api: openai-completions`、`baseURL: https://openrouter.ai/api/v1`、你的 `OPENROUTER_DEEPSEEK_API_KEY` 凭证引用、`compat: { thinkingFormat: openrouter }`，以及 `openRouterProvider: { order: [deepseek], allowFallbacks: false }`。在模型 `deepseek/deepseek-v4.1-flash-1017` 上声明 `assistantPrefill: trailing-message`、相同的 `tokenLogprobs` 块和 `reasoningEfforts: { off: null, high: high }`。请勿将账户专属预设模型 ID 复制到共享配置中。

先尝试一次短续写。能力声明记录端点承诺的能力，不会为提供商添加功能。如果提供商拒绝前缀或没有返回对齐的概率，请删除不受支持的声明，或选择其他已有文档的路由。Weave 使用无工具调用，在模型声明 Off 设置时关闭推理，并且仅为捕获到概率的回答文本添加标注。

## Weave、token 探索和导出

以下字段属于 `loom`。能否使用文本前缀和 token 概率仍由 provider 能力决定；调整限制无法为模型添加不支持的功能。

| 配置键 | 默认值 | 作用 |
|---|---|---|
| `weave.maxSiblings` | `4` | 每次散文请求的备选数量上限；最多可配置为 `16`。 |
| `weave.maxTokens` | `200` | 每个散文 sibling 的默认和最大输出 token 数。 |
| `weave.temperature` / `weave.topLogprobs` | `1` / `10` | 默认温度和捕获的 token 备选数量；备选数量范围为 `0` 至 `20`。 |
| `weave.leadDelayMs` / `weave.timeoutMs` | `1500` / `120000` | 先行调度延迟和整个操作的超时，单位为毫秒。 |
| `weave.warmWindowMs` / `weave.maxPrefixCodePoints` | `3600000` / `262144` | 前缀预热窗口（毫秒）和前缀的 Unicode 码点数上限。 |
| `probe.maxDepth` / `probe.maxRequests` | `4` / `32` | 单次 token 探索的最大深度和 provider 调用次数。 |
| `probe.cutoff` / `probe.topLogprobs` | `0.02` / `20` | 路径累计概率下限和每次探索调用捕获的备选数量。 |
| `export.maxBytes` / `export.maxDownloads` | `16777216` / `64` | 编码后快照的最大字节数和保留的下载数量上限。 |
| `export.ttlMs` | `300000` | 下载 URL 的有效期，单位为毫秒。 |

本参考覆盖常用设置，不逐一列出 Remote 方法或高级字段。源码声明定义了 [Loom 设置](https://github.com/scasella/dsh-loom/blob/main/vendor/harness/packages/experimental/loom/src/index.ts)、[autoloom 设置](https://github.com/scasella/dsh-loom/blob/main/vendor/harness/packages/experimental/tool-loom/src/index.ts) 和 [worktree 设置](https://github.com/scasella/dsh-loom/blob/main/vendor/harness/packages/experimental/worktree/src/index.ts)。具体流程和持久化限制见[用户指南](guide.zh.md)。
