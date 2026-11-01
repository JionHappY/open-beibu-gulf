# 数据来源与假设

本仓只带「能演示产品」的最小数据，完整数据与来源登记在主仓 `tools/data-audit/source-registry.json`。

## 文件与来源

| 路径 | 内容 | 来源 | 性质 |
| --- | --- | --- | --- |
| `backend/data/forecast/throughput-history.json` | 北部湾三港吞吐量历史序列 | 交通运输部/地方统计公报整理 | 公开统计，标注年份与口径 |
| `backend/data/forecast/*.json` | 预测模型产物（指数平滑、灰色预测等） | 由历史序列复算 | 可复现，非实测 |
| `backend/data/flood/waterLevel.json` | 水位基准/分段阈值 | 参考参数（非实时观测） | **假设值** |
| `backend/data/flood/facilityPoints.json` | 设施点位与受损率 | 示意数据，`estimated: true` | **假设值** |
| `backend/data/flood/terrainProfile.json` | 地形剖面采样 | DEM 派生 | 依赖未随仓的 DEM |
| `frontend/public/data/ports.json` | 港口锚点 | 公开坐标整理 | 公开数据 |
| `frontend/public/data/boundary.geojson` | 行政区边界 | 公开矢量简化 | 公开数据，精度已降 |

## 口径约定

- 预测结果均为**模型输出**，UI 上以「示意插值/示例数据」角标披露；
- 洪涝淹没范围依赖 DEM 与水位假设，只作方法演示，不可用于实际防汛决策；
- 设施受损率、分摊比例为**作者设定**，未经业务校验。

## 许可与再分发

公开统计数据沿用其原始发布许可；示意与假设数据为本仓自造，随本仓 MIT 许可发布。
