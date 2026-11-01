# 北部湾智慧港口 WebGIS（开源精简版）

一个面向港口运营的 WebGIS 演示系统：二维（OpenLayers）/三维（Cesium）双引擎，Vue 3 + NestJS + PostGIS。
本仓是从主仓按「只带产品本身」原则抽取的精简版——**不带**论文文档、门禁与审查工具链、大体积地形/倾斜摄影资产。

## 业务模块

| 路由 | 模块 | 说明 |
| --- | --- | --- |
| `/` | 总览 | 港口吞吐量概览、雷达对比、图层开关 |
| `/site-suitability` | 港址适宜性 | AHP 层次分析 + 多因子加权，输出适宜性分级 |
| `/diversion-analysis` | 分洪分析 | 分洪通道方案、三港分摊、影响范围 |
| `/forecast` | 吞吐量预测 | 时间序列/指数平滑/灰色预测，含置信区间 |
| `/flood-analysis` | 洪涝分析 | 水位～淹没范围、设施受损、地形剖面 |
| `/route-analysis` | 航线分析 | 3D 航线规划、相机沿路径取景、通视分析 |

## 目录

```
frontend/           Vue 3 前端（src 源码 + public 静态资产 + e2e 未随仓）
backend/            NestJS 后端（src 源码 + test 用例 + data 样例 + static 元数据）
db/                 建表与种子 SQL（PostGIS）
data/               数据来源与假设登记（见 data/README.md）
docker-compose.yml  PostGIS 服务
Dockerfile          后端镜像
```

## 快速开始

```bash
# 前端（仓库根统一管理前端依赖与脚本）
npm install
npm test                 # 160 个测试文件 / 1105 个用例
npm run typecheck        # vue-tsc
npm run dev              # http://localhost:5173

# 后端
npm --prefix backend install
npm --prefix backend run build
npm --prefix backend test
npm run dev:server       # http://localhost:3000

# 数据库
docker compose up -d postgis
psql -f db/db-schema.sql ...
```

## 数据与资产说明

- `backend/data/forecast/`：吞吐量历史与模型产物（官方公报衍生序列，含来源标注）。
- `backend/data/flood/`：设施点位、水位基准、地形剖面等 JSON 样例。
- **未随仓**：`backend/data/flood/dem/`（51MB DEM 栅格）、`flood_levels.json.gz`（18MB）、
  `backend/static/**` 的 b3dm/影像瓦片本体（370MB+）。仓内只保留 `tileset.json` 等元数据索引，
  用于校验加载逻辑；缺资产时三维图层会退化为空。
- 数据来源、口径与假设见 `data/README.md`。

## 与主仓的差异

| 主仓有 | 本仓 |
| --- | --- |
| `tools/`（守卫、审计、3D 管线，359 件） | 不带 |
| `docs/`（论文期文档，83 件） | 不带 |
| `scripts/`、`.github/`、`.husky/` 门禁 | 不带 |
| 大体积 DEM / 倾斜摄影 / 影像 | 只带元数据 |
| 完整 CI 脚本（ci:local 等） | 只留 `test` / `typecheck` / `build` / `lint` |

## 验证状态（2026-11-01）

已验证：

- 前端 `vue-tsc --noEmit` 通过；
- 前端 `vitest run`：**160 文件 / 1105 用例全绿**（与主仓同数）；
- 后端 `nest build` 通过；
- 后端 `vitest run`：**59 文件通过 / 8 跳过，593 用例通过 / 83 跳过**（需 DB 的 e2e 自动跳过）。

以上四项在与主仓相同的 `node_modules` 下复现，数字与主仓逐项相同。

未验证（本仓为源码级抽取，未从零装依赖）：

- `npm install` 从零安装（本次验证借用主仓 `node_modules`）；
- `docker compose up` 起库后 5 个路由的端到端连通（E2E 未随仓）。

## 许可

MIT，见 `LICENSE`。
