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

展开操作在创建 fork 前检查预算。已结算的自身用量超出 token 或美元预算时，用量监视器会停止子分支；最后一次响应可能超出预算。自主预算和排队中的分支启动状态保存在 Host 内存中，重启后重置。具体操作见[autoloom 流程](guide.zh.md#autoloom)。

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
