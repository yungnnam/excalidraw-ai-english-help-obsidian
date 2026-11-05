# 发布与安装手册

本仓库的发布流程由 tag 驱动：打 tag → GitHub Actions 构建、测试、上传产物 → Release 就绪。

## 当前状态

本地 `main` 领先 `origin/main` 两个提交，tag 尚未创建：

| 提交 | 内容 |
| --- | --- |
| `c6f662a` | 修正 README 的 BRAT 路径，引用剩余三张截图 |
| `3c73897` | 文档与实现对齐，补重入锁与缓存键，清理旧名残留 |
| `96a5783` | feat: ai-english-help 0.1.2（已推送） |

本地构建产物：`main.js` 91,933 字节（89.8 KiB），43 项单测与 13 组冒烟全部通过。版本号 `0.1.2`，与将要创建的 tag 一致。

---

## 一、推送提交

### 图形界面（推荐）

1. 打开 GitHub Desktop，左侧选 `harness的工作区/excalidraw-english-coach`
2. 顶部若显示 `Push origin`（带数字 2），点击即可
3. 若顶部没有该按钮：菜单 `Repository` → `Push`
4. 推送完成后左上角显示 `Last fetched just now`，右侧 `History` 里能看到两个新提交

### 命令行（需要凭证）

```powershell
$git = "C:\Users\q1611\AppData\Local\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe"
cd "C:\Users\q1611\Desktop\harness的工作区\excalidraw-english-coach"
& $git push origin main
```

命令行失败并报 `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS` 属预期：本机 git 没有存 GitHub 凭证，OAuth 令牌只在 GitHub Desktop 内部。这种情况直接用图形界面推送。

---

## 二、创建 Release

### 操作顺序

1. 打开 <https://github.com/yungnnam/excalidraw-ai-english-help-obsidian/releases/new>
2. **Choose a tag** 输入 `0.1.2`，点列表里的 `Create new tag: 0.1.2 on publish`
3. **Target** 保持 `main`
4. **Release title** 填 `0.1.2`
5. **Describe this release** 可以留空（workflow 会写入安装说明）
6. **Attach binaries** 留空，不要上传任何文件
7. 点 **Publish release**

### 为什么附件留空

点 Publish 会创建 tag，触发 `.github/workflows/release.yml`：

```
node dev/build.mjs → node dev/test.mjs → node dev/smoke.mjs
→ 校验 tag 与 manifest.json 的 version 一致
→ softprops/action-gh-release 上传 main.js / manifest.json / styles.css
```

手填附件反而会与 workflow 上传的产物重复。BRAT 与 Obsidian 更新机制只认 `main.js`、`manifest.json`、`styles.css` 这三个资产。

### 常见失败

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| Actions 红叉在「校验 tag 与 manifest 版本一致」 | tag 写成 `v0.1.2`，与 `manifest.json` 的 `0.1.2` 不等 | 删掉 Release 与 tag，重打 `0.1.2` |
| 同一步骤失败且注解写 `Process completed with exit code 2` | 该步骤的 shell 脚本有语法错误（引号不配对、行尾 CRLF 等），不是版本真的不一致 | 修 `.github/workflows/release.yml` 后重新打 tag |
| Release 已创建但 Assets 为空 | workflow 失败或仍在运行 | 打开 Actions 页看日志，修好后重新发布 |
| `Resource not accessible by integration` | workflow 缺少 `permissions: contents: write` | 仓库 Settings → Actions → General → Workflow permissions 选 `Read and write` |

---

## 三、验证发布

```powershell
$repo = "yungnnam/excalidraw-ai-english-help-obsidian"
Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" |
  Select-Object tag_name, @{n="assets";e={$_.assets.name}}
```

预期输出 `tag_name: 0.1.2`，assets 含三个文件名。同时检查：

- Actions 页最新一次 `Release` 运行是绿色的
- README 里的 `[Releases](../../releases)` 链接不再指向空页面

---

## 四、本机更新

本机库 `C:\Users\q1611\Desktop\笔记\课本学习\.obsidian\plugins\ai-english-help\` 已同步到最新构建（三件哈希与仓库一致），Obsidian 内操作：

1. `Ctrl+P` → `Reload app without saving`
2. 确认设置 → 第三方插件里 `ai-english-help` 为启用状态

不要用「退出 Obsidian」的方式重启：普通退出会用内存中的插件列表覆盖 `community-plugins.json`。

---

## 五、另一台电脑安装

### 方式 A：zip 包（无需 Git）

安装包：`dist/ai-english-help-0.1.2.zip`（32,405 字节），解压后得到 `ai-english-help/` 目录与 `安装说明.txt`。

1. 目标电脑先安装并启用 Excalidraw 插件
2. 解压 zip，把 `ai-english-help` 整个目录放进 `<库>\.obsidian\plugins\`
   （设置 → 第三方插件 → 已安装插件 → `打开插件文件夹` 可直接定位）
3. 重启 Obsidian，设置 → 第三方插件 → 刷新 → 启用 `ai-english-help`
4. 设置 → `ai-english-help` → 填 API Key

从旧版升级：先删掉旧目录再放新目录，否则列表里会同时出现两条。`data.json` 不要删，里面有 Key 与缓存。

### 方式 B：BRAT（自动跟随 Release）

1. 安装 BRAT 插件
2. `BRAT` → `Add Beta plugin` → 填 `yungnnam/excalidraw-ai-english-help-obsidian`
3. 启用 `ai-english-help`

BRAT 依赖已发布的 Release，未发版时提示找不到插件。

### 方式 C：手动下载资产

从 <https://github.com/yungnnam/excalidraw-ai-english-help-obsidian/releases> 下载 `main.js`、`manifest.json`、`styles.css`，放进 `<库>\.obsidian\plugins\ai-english-help\`。

---

## 六、后续发版流程

1. 改 `manifest.json` 的 `version`（例如 `0.1.3`），同步 `versions.json`：`{"0.1.3": "1.5.0"}`
2. 重新构建：`node dev/build.mjs`
3. 跑测试：`node dev/test.mjs`、`node dev/smoke.mjs`
4. 提交并推送（含 `main.js` 构建产物）
5. 按第二节用新版本号建 tag 与 Release

版本号只允许 `x.y.z` 三段数字，tag 与 `manifest.json` 必须完全一致。

---

## 附：本地开发命令

```powershell
$node = "C:\Users\q1611\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
cd "C:\Users\q1611\Desktop\harness的工作区\excalidraw-english-coach"

& $node dev/build.mjs     # 生成 main.js，并复制一份到 dist/
& $node dev/test.mjs      # 43 项单元测试
& $node dev/smoke.mjs     # 13 组端到端冒烟（假 obsidian + 假 ExcalidrawAPI）
& $node dev/preview.mjs   # 生成卡片预览 HTML 与 JSON 模型
```

构建命令不要接 `Select-Object` 之类的管道截断：node 会收到 EPIPE 中断，`main.js` 被写成 0 字节。
