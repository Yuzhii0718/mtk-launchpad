# MTK Launchpad Web

基于 React + TypeScript + Vite 的纯前端 UART 启动工具。

## 功能概览

- 无服务器架构（浏览器端直连串口，Web Serial API）
- 芯片选择：`mt7622/mt7629/mt7981/mt7986/mt7987/mt7988`
- DDR 选择：`default/flyby/ddr3/ddr4`（按芯片约束）
- BL2 加载模式：
  - 仅启动 BL2
  - BL2 后加载 FIP
- 文件来源：
  - 内置 `ramboot` 预编译 BL2
  - GitHub Release 自动拉取并解析文件名
  - 本地上传
- MD5 校验（按文件名中的 `md5-xxxx` 规则自动比对）
- 日志输出（关键协议阶段可见）

## 目录说明

- `src/services/serial/SerialConnection.ts`：Web Serial 收发封装
- `src/services/serial/MtkUartProtocol.ts`：BootROM + BL2 协议逻辑
- `src/utils/fileNameParsers.ts`：BL2/FIP 命名解析与元数据提取
- `src/utils/githubRelease.ts`：GitHub Release 资产拉取
- `src/data/builtinRamboot.ts`：内置 `ramboot` 资产映射
- `src/i18n.ts`：多语言资源

## 快速开始

1. 安装依赖
2. 启动开发模式或执行构建

> 说明：当前仓库 Node 为 `20.12.1`，项目已固定到 `Vite 5` 兼容版本。

## 脚本

- `npm run dev`：开发模式
- `npm run build`：生产构建
- `npm run test`：运行单元测试
- `npm run lint`：代码检查

## 注意事项

- Web Serial 浏览器会弹出端口选择器。
- BootROM/BL2 协议依赖目标设备状态，实际烧录请在真实硬件上验证。
- 若文件名不含 MD5 标记，工具会计算 MD5 但不做“期望值比对失败”拦截。

## 致敬

- [mtk_uartboot](https://github.com/981213/mtk_uartboot)
- [esp-launchpad](https://github.com/espressif/esp-launchpad)
