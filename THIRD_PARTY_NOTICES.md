# Third-Party Notices

Loom includes source derived from [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), copyright (c) 2026 DeepSeek, under the [MIT license](LICENSE). The extraction is based on the independently maintained [reference implementation at commit `77ccab27d200241ddf49d0ec9f5de1524343374f`](https://github.com/scasella/deepseek-harness/tree/77ccab27d200241ddf49d0ec9f5de1524343374f). The root license preserves the original copyright and permission notice. DeepSeek's bundled running-whale image is covered by the same license.

## Code included in this distribution

The browser bundles include the following third-party code. Full copyright, permission and warranty notices are preserved in the linked license files; their terms remain unchanged. The Host build includes Loom and Harness source and leaves other npm runtime packages external. The build input records in `dist/build/host-inputs.json` and `dist/build/client-inputs.json` identify the bundled inputs. [The license inventory](licenses/manifest.json) records package versions, included files and license hashes.

| Package | Bundled version | License text |
| --- | --- | --- |
| `@deepseek-ai/cosmokit` | 1.8.6 | [MIT](licenses/deepseek-ai-cosmokit/LICENSE) |
| `@deepseek-ai/schemastery` | 3.18.5 | [MIT](licenses/deepseek-ai-schemastery/LICENSE) |
| `@lexical/clipboard` | 0.49.0 | [MIT](licenses/lexical-clipboard/LICENSE) |
| `@lexical/dragon` | 0.49.0 | [MIT](licenses/lexical-dragon/LICENSE) |
| `@lexical/extension` | 0.49.0 | [MIT](licenses/lexical-extension/LICENSE) |
| `@lexical/history` | 0.49.0 | [MIT](licenses/lexical-history/LICENSE) |
| `@lexical/html` | 0.49.0 | [MIT](licenses/lexical-html/LICENSE) |
| `@lexical/plain-text` | 0.49.0 | [MIT](licenses/lexical-plain-text/LICENSE) |
| `@lexical/selection` | 0.49.0 | [MIT](licenses/lexical-selection/LICENSE) |
| `@lexical/text` | 0.49.0 | [MIT](licenses/lexical-text/LICENSE) |
| `@lexical/utils` | 0.49.0 | [MIT](licenses/lexical-utils/LICENSE) |
| `@preact/signals-core` | Embedded; version unstated | [MIT](licenses/preact-signals-core/LICENSE) |
| `clsx` | 2.1.1 | [MIT](licenses/clsx/LICENSE) |
| `lexical` | 0.49.0 | [MIT](licenses/lexical/LICENSE) |

Lexical's published extension bundle already includes Preact Signals code. Its embedded version is not identified in that file; the copied Preact license comes from the installed `@preact/signals-core@1.14.4` package and preserves the Preact Team copyright. The inventory records that distinction rather than assigning the installed version to the embedded code.

## Installed runtime and development tools

The package uses the official Harness installation's Cordis, pi-ai SDK and other external runtime packages. The supported SDK is `@earendil-works/pi-ai@1.3.0`; its implementation is not bundled or replaced by this package. This distribution does not ship the reference checkout's pi-ai 1.1.0 patch. Installed dependencies retain their own license and notice files.

The published package manifest declares separately installed `@deepseek-ai/schemastery` and `zod`, and the Cordis peer dependency. Build and test dependencies are recorded in the source project's `package-lock.json` and are excluded from the installation tarball. Tools such as esbuild, TypeScript and lightningcss produce the distribution without becoming bundled runtime implementations.
