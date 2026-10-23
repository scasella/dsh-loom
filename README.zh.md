# DeepSeek Harness 的 Loom 插件

[English](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/README.md) | 中文

[![npm alpha](https://img.shields.io/npm/v/@scasella/dsh-loom/alpha?label=npm%20alpha)](https://www.npmjs.com/package/@scasella/dsh-loom/v/0.1.0-alpha.5) [![GitHub release](https://img.shields.io/github/v/release/scasella/dsh-loom?include_prereleases&label=GitHub%20release)](https://github.com/scasella/dsh-loom/releases/tag/v0.1.0-alpha.5)

一次生成多个续写，以树状结构探索，并保留每条路径。Loom 为官方 DeepSeek Harness Web 应用提供对话分支、Git worktree 代码比较和 Weave 散文编辑器。

这是一个社区 bundle，目标运行时为 **`@deepseek-ai/dsh@0.2.1-rc.2`**。它通过原始 `dsh plugin` 命令安装，并自带兼容提供者，无需运行参考 Harness fork。请按下方说明安装固定版本的 npm alpha，或使用对应的 GitHub 发布 tarball。独立 profile 的安装、启动、移除和功能检查均已通过。安装前请阅读[兼容性和验证状态](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/COMPATIBILITY.md)。

## 演示

https://github.com/user-attachments/assets/3a35ceab-bd12-4e20-a4c9-b0bda106d687

这段 3 分 54 秒的字幕演示展示相同的 Loom 功能，在[参考实现](https://github.com/scasella/deepseek-harness/tree/77ccab27d200241ddf49d0ec9f5de1524343374f)上记录真实模型调用，使用捕获的界面状态并调整了展示时长。[完整画质 MP4](https://github.com/scasella/dsh-loom/releases/download/v0.1.0-alpha.3/Loom.mp4) · [字幕](https://github.com/scasella/dsh-loom/releases/download/v0.1.0-alpha.3/Loom.srt)。

## 功能

- **分支与阅读：**重新生成多个回答，给变体添加不同指令，将提示词编辑为新分支，查看请求与推理，并将备选标记为保留或搁置。
- **代码比较：**在独立 Git worktree 中执行不同修改，比较测试、差异、用量和耗时，然后应用补丁或采纳分支。
- **探索观察结果：**在分支中替换已记录的工具结果，无需重跑该工具或添加用户消息即可继续。
- **使用 Weave 写作：**在光标位置生成续写，保留同级候选，检查受支持的词元概率，探索备选词元，并连同筛选记录导出文本。
- **导航与委托：**浏览 Multiverse 分支家族，搜索自身或继承消息，使用键盘和移动端控件，并让模型在明确预算内探索。

[Loom 用户指南](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/docs/guide.zh.md)介绍各项使用流程。[文档索引](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/docs/README.zh.md)汇集配置、兼容性和[验证说明](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/VERIFICATION.md)。npm 包包含中英文用户指南、配置参考和文档索引。支持的 Harness/SDK 版本保持不变。

Alpha.5 包含[验收审查修复](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/docs/review-resolutions.zh.md)：子会话遇到人工问题和审批请求时返回已记录的错误，空 Weave 选择无法导出聊天，对比保留新应用的差异。此外还改进了键盘操作、分支标签、费用、请求检查和模型设置说明。

<a id="install"></a>
## 安装

需要 Node.js 24+ 或 22.x 系列中的 22.19+、Git 2.26+、PATH 中可用的 pnpm，以及官方 **`@deepseek-ai/dsh@0.2.1-rc.2`** 运行时和其中安装的 `@earendil-works/pi-ai@1.3.0` SDK。bundle 会拒绝不受支持的 SDK 版本。如有需要，请安装这一准确版本的运行时：

```sh
npm install --global @deepseek-ai/dsh@0.2.1-rc.2
```

在 POSIX shell 中将固定版本的 npm alpha 安装到独立 home：

```sh
export DSH_HOME="$HOME/.dsh-loom"
dsh plugin --profile web add @scasella/dsh-loom@0.1.0-alpha.5
dsh web --no-open --port 3097
```

[GitHub v0.1.0-alpha.5 tarball](https://github.com/scasella/dsh-loom/releases/download/v0.1.0-alpha.5/scasella-dsh-loom-0.1.0-alpha.5.tgz) 是此版本的另一安装来源。下载后，使用同一个 home 执行 `dsh plugin --profile web add /absolute/path/scasella-dsh-loom-0.1.0-alpha.5.tgz`。

打开启动器输出的 URL，并保留其中的本地认证令牌。此 home 和端口不会改变使用普通 `~/.dsh`、运行在 3080 端口的实例。如果 3097 已被占用，请选择其他空闲端口。每次恢复 Loom 时都设置同一个 `DSH_HOME`。安装或移除后请重启 Web 实例。

已有自定义 profile 或模型设置时，使用现有 home 前请阅读[配置迁移](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/COMPATIBILITY.md#configuration-migration)。本 bundle 只在安装它的 profile 中替换指定 provider。其他 runtime 版本不受支持；请勿绕过版本拒绝。

## 首次使用

1. 打开 **Settings → Models**，输入 provider 凭据，并在输入框中选择模型。凭据应保存在 Harness 设置中，不应放入本包。
2. 选择可丢弃的 workspace，开始对话。一轮对话结束后（包括失败的轮次），打开 Chat 旁的 **Loom**。
3. 使用 **Regenerate ×2**，在 **Read** 中切换子分支，并将喜欢的分支标记为 **Keep**。打开侧边栏的 **Multiverse** 浏览家族。
4. 修改代码前，先选择 worktree 隔离，再创建分支并查看 **Compare**。Git 仓库必须至少有一次提交，并允许 workspace 写入。
5. 打开 **Weave** 撰写散文。请按 [Weave 提供商设置](docs/configuration.zh.md#weave-provider-setup)显式声明路由能力；仅选择目录模型不会启用助手前缀或概率。

每个分支、散文续写和词元探测都可能产生付费模型调用。请从较小数量开始。默认不提供价格；配置后的美元数值为标价估算。让模型自主探索前，请设置分支数、深度、词元数和可选的美元预算。

## 保存数据与移除

Session 历史、散文与选择会持久保存。分支队列和自主预算保存在 Host 内存中，重启后不会恢复。Worktree 会复制已跟踪的修改，不包含未跟踪或忽略的文件，也不会安装依赖。应用补丁需要干净的来源 checkout。采纳会保留历史，不会应用文件或移除 worktree；请使用 Apply 或 Discard 清理。

移除 bundle 前，请导出需要保留的内容，停止活动分支，并清理由它创建的 worktree：

```sh
dsh plugin --profile web remove @scasella/dsh-loom
```

使用同一个 home 和 profile，然后重启。Loom 中创建的模型仍保存在其兼容条目下，移除后不会显示在原版模型页面；重新安装 Loom 即可恢复，也可[在移除前转移模型设置](COMPATIBILITY.md#return-to-stock-model-settings)。凭证和会话历史仍保留在主目录中。实验性 Loom 记录可能需要启用 Loom 才能完整呈现。

## 构建与许可

源码项目可通过 `npm ci` 和 `npm run build` 构建。`npm run pack:check` 检查实际 npm 打包清单，并扫描包内文本中的私密文件、机器路径和未解析的源码导入。安装 tarball 不包含开发源码。支持的版本、设置 ID 和验证范围见 [COMPATIBILITY.md](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/COMPATIBILITY.md)。

持续检查、可信发布和带标签 npm 发布的维护者说明见[发布指南](https://github.com/scasella/dsh-loom/blob/main/docs/releasing.zh.md)。

[MIT](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/LICENSE)。Loom 源自已归档的参考分支提交 `77ccab27d200241ddf49d0ec9f5de1524343374f`，以及由 DeepSeek AI 开发的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。第三方声明见 [THIRD_PARTY_NOTICES.md](https://github.com/scasella/dsh-loom/blob/v0.1.0-alpha.5/THIRD_PARTY_NOTICES.md)。本包由社区维护，不是 DeepSeek 官方发行版。
