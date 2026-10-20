# 检查与发布 Loom

[English](releasing.md) | 中文

本指南面向从 `scasella/dsh-loom` 检查变更并发布新版 `@scasella/dsh-loom` 的维护者。最终用户请参阅[安装说明](../README.zh.md#install)。已发布版本和 Git 标签不可更改。

## 持续检查

[Checks](https://github.com/scasella/dsh-loom/blob/main/.github/workflows/checks.yml) 在拉取请求、向 `main` 推送、手动触发以及发布工作流调用时运行。Ubuntu 矩阵使用 Node `22.19.0` 和 `24`，并提供 pnpm `10.11.1` 供官方 Harness 插件 CLI 使用。

每个作业通过 `npm ci` 安装锁定的开发依赖，构建 Host 与浏览器输出，运行严格类型检查和包检查，然后打包一个归档。作业独立安装官方 `@deepseek-ai/dsh@0.2.1-rc.2` 和 `@earendil-works/pi-ai@1.3.0`，再针对该归档运行带 `--all-tests --web-smoke` 的[官方运行时验证器](https://github.com/scasella/dsh-loom/blob/main/scripts/verify-stock.mjs)。验证器使用独立 home 与分配的端口，检查安装和卸载，并确认官方运行时保持不变。

作业上传 `loom-package-22.19.0` 和 `loom-package-24`，各自包含已测试的 `.tgz` 和 `SHA256SUMS`。发布构建不恢复依赖缓存。模型密钥为空；这些检查无需仓库密钥或付费模型调用。检查覆盖已安装插件的集成与 Web 启动，不代表已验证浏览器交互流程或真实提供商调用。

## 可信发布者设置

创建 GitHub 环境 `npm`，将部署策略限制为匹配 `v*` 的标签。在 npm 包的可信发布者设置中保持以下 GitHub Actions 配置：

| 字段 | 值 |
| --- | --- |
| 组织或用户 | `scasella` |
| 仓库 | `dsh-loom` |
| 工作流文件名 | `publish.yml` |
| 环境名称 | `npm` |
| 允许的操作 | 启用通过 `npm publish` 直接发布 |

发布作业使用 GitHub 托管的 Ubuntu、Node `24`、npm `11.21.0`，以及作业权限 `contents: read` 和 `id-token: write`。npm 将 GitHub 身份交换为短期发布凭据并附加来源证明。不要添加 `NPM_TOKEN` 密钥。保持 npm 维护者账户的双因素认证开启。

[npm 当前的可信发布政策](https://docs.npmjs.com/trusted-publishers/)要求在创建可信发布者后的两天内首次成功发布。保存配置或运行预演不会验证配置。如果配置在下次发布前到期，请在准备发布时重新创建；政策变更以链接页面为准。npm 始终允许暂存发布，因此必须为本工作流明确启用直接发布。

## 准备版本

选择尚未发布的版本，并一起更新以下值：

| 文件 | 版本位置 |
| --- | --- |
| [package.json](../package.json) | `version` |
| [package-lock.json](https://github.com/scasella/dsh-loom/blob/main/package-lock.json) | 顶层 `version` 和 `packages[""].version` |
| [src/index.ts](https://github.com/scasella/dsh-loom/blob/main/src/index.ts) | `loomMetadata` 版本 |
| [scripts/build-client.mjs](https://github.com/scasella/dsh-loom/blob/main/scripts/build-client.mjs) | 浏览器包元数据版本 |

为新版本更新固定版本的安装命令、npm 徽章和版本化文档链接。保持旧发布资产和演示链接可用。运行 `npm ci`、`npm run build`、`npm run typecheck` 和 `npm run pack:check`；然后按[验证说明](../VERIFICATION.md)打包，并针对独立官方安装验证新归档。验证器调用需包含 `--all-tests --web-smoke`。

将已审阅的变更提交到 `main`，推送后等待 Checks 通过。例如，在 `main` 上准备好版本 `0.1.0-alpha.5` 后：

```sh
git push origin main
git tag -a v0.1.0-alpha.5 -m 'Loom v0.1.0-alpha.5'
git push origin v0.1.0-alpha.5
```

## 通过标签发布

[Publish](https://github.com/scasella/dsh-loom/blob/main/.github/workflows/publish.yml) 接受 `v*` 标签推送。标签必须与上述所有版本位置一致，且被标记的提交必须属于 `main`。支持的预发布通道直接映射到 npm 分发标签：

| 版本示例 | npm 标签 |
| --- | --- |
| `1.0.0-alpha.1` | `alpha` |
| `1.0.0-beta.1` | `beta` |
| `1.0.0-rc.1` | `rc` |
| `1.0.0-next.1` | `next` |
| `1.0.0` | `latest` |

标签推送会重新运行完整的 Checks 矩阵。只有 `scasella/dsh-loom` 中实际的标签推送事件才能发布。发布作业下载已测试的 Node `24` 构建产物，验证校验和，并以公开访问权限、选定的 npm 标签、来源证明和禁用生命周期脚本的方式发布该归档。发布作业不会重新构建包。

工作流成功后，在 npm 确认版本、分发标签和来源证明，并在独立 home 中测试固定版本的 `dsh plugin --profile web add` 命令。随后单独创建匹配的 GitHub release，附上发布说明、已验证归档及校验和、安装说明和现有演示链接。如果标签或 npm 版本已存在，请准备新版本，不要移动或覆盖旧版本。

## 预演与故障处理

手动运行发布工作流，可在不发布的情况下执行检查和发布预览：

```sh
gh workflow run publish.yml --ref main
```

手动触发仅运行完整检查和 `npm publish --dry-run`。它不能发布，预览通过也不能证明 npm 接受了 OIDC 身份。首次真实标签发布才是对可信发布的验证。

认证失败时，请对照上表核实 npm 中的所有者、仓库、工作流文件名、环境和直接发布权限，然后检查配置是否到期。版本或提交归属检查失败时，请在 `main` 修正源码并创建新的匹配标签。检查失败时，请查看失败的作业并修正变更后再发布；不要绕过已测试归档的发布路径。
