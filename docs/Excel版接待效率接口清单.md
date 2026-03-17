# Excel版接待效率接口清单

基准需求文件：`docs/数据看板需求.xlsx`

适用页面：`index.html` 首页 4 个 tab

## 1. AI接待效率

| Excel字段 | 前端元素 | 当前来源 | 当前状态 | 建议后端字段 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 店铺总接待人数 | `stat-store-total` | 前端推导 | 待接口 | `store_total_reception_num` | 当前按 `AI接待人数 / AI接待覆盖率` 反推 |
| AI接待人数 | `stat-ai-reception` | `/rate/all_num` | 已接 | `all_num` | 已在用 |
| AI接待覆盖率 | `stat-ai-coverage-rate` | 前端推导 | 待接口 | `ai_reception_coverage_rate` | 当前按 `AI接待人数 / 店铺总接待人数` 计算 |
| AI全自动接待人数 | `stat-auto-reception` | 前端推导 | 待接口 | `ai_auto_reception_num` | 当前按 `AI接待人数 - 转人工人数` |
| AI全自动接待率 | `stat-auto-rate` | 前端推导 | 待接口 | `ai_auto_reception_rate` | 当前按 `AI全自动接待人数 / AI接待人数` |
| AI辅助接待人数 | `stat-assist-reception` | 前端推导 | 待接口 | `ai_assist_reception_num` | 当前按 `转人工人数` 映射 |
| AI辅助接待率 | `stat-assist-rate` | 前端推导 | 待接口 | `ai_assist_reception_rate` | 当前按 `AI辅助接待人数 / AI接待人数` |

建议：
- 这一组最好由后端直接返回，不要让前端长期推导。
- `店铺总接待人数` 是否包含纯人工接待，需要业务确认后固化口径。

## 2. AI全自动接待未转人工效率

表格 DOM：`auto-efficiency-table-body`

行维度：
- 用户回话3句话以内会话
- 用户回话3句话以上会话

列维度：

| Excel字段 | 当前来源 | 当前状态 | 建议后端字段结构 | 备注 |
| --- | --- | --- | --- | --- |
| 接待人数 | 前端推导 | 待接口 | `auto_efficiency_rows[].reception_num` | 当前用 `自动接待人数` 再拆分 |
| 询单人数 | 部分接口 + 前端拆分 | 待接口 | `auto_efficiency_rows[].inquiry_num` | 现有只拿到总 `no_trade_num` |
| 询单成交人数（退款前） | 部分接口 + 前端拆分 | 待接口 | `auto_efficiency_rows[].success_num_before_refund` | 现有只拿到总 `no_trade_and_success` |
| 询单成交金额（退款前） | mock/推导 | 待接口 | `auto_efficiency_rows[].success_amount_before_refund` | 当前无真实接口 |
| 询单转化率（退款前） | 前端计算 | 待接口 | `auto_efficiency_rows[].conversion_rate_before_refund` | 可由后端直接回，也可前端算 |
| 询单成交客单价 | 前端计算 | 待接口 | `auto_efficiency_rows[].avg_order_value` | 当前无真实金额接口 |

建议返回示例：

```json
{
  "auto_efficiency_rows": [
    {
      "session_bucket": "lte_3_messages",
      "session_bucket_label": "用户回话3句话以内会话",
      "reception_num": 260,
      "inquiry_num": 42,
      "success_num_before_refund": 8,
      "success_amount_before_refund": 1264,
      "conversion_rate_before_refund": 19.05,
      "avg_order_value": 158
    },
    {
      "session_bucket": "gt_3_messages",
      "session_bucket_label": "用户回话3句话以上会话",
      "reception_num": 6940,
      "inquiry_num": 2058,
      "success_num_before_refund": 352,
      "success_amount_before_refund": 83072,
      "conversion_rate_before_refund": 17.10,
      "avg_order_value": 236
    }
  ]
}
```

## 3. AI辅助人工接待效率

| Excel字段 | 前端元素 | 当前来源 | 当前状态 | 建议后端字段 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 接待人数 | `assist-stat-reception` | 前端推导 | 待接口 | `assist_efficiency.reception_num` | 当前按转人工人数映射 |
| 询单人数 | `assist-stat-inquiry` | 前端推导 | 待接口 | `assist_efficiency.inquiry_num` | 当前无真实拆分 |
| 询单成交人数（退款前） | `assist-stat-order-count` | 前端推导 | 待接口 | `assist_efficiency.success_num_before_refund` | 当前无真实拆分 |
| 询单成交金额（退款前） | `assist-stat-order-amount` | mock/推导 | 待接口 | `assist_efficiency.success_amount_before_refund` | 当前无真实金额接口 |
| 询单转化率（退款前） | `assist-stat-conversion-rate` | 前端计算 | 待接口 | `assist_efficiency.conversion_rate_before_refund` | 建议后端也返回 |
| 询单成交客单价 | `assist-stat-aov` | 前端计算 | 待接口 | `assist_efficiency.avg_order_value` | 当前无真实金额接口 |

建议返回示例：

```json
{
  "assist_efficiency": {
    "reception_num": 1800,
    "inquiry_num": 792,
    "success_num_before_refund": 166,
    "success_amount_before_refund": 47808,
    "conversion_rate_before_refund": 20.96,
    "avg_order_value": 288
  }
}
```

## 4. AI接待场景接待人数体现

当前前端区域：
- 汇总卡：`scene-total-transfer`、`scene-no-answer-transfer`
- 矩阵表：`scene-header-row`、`scene-count-row`、`scene-share-row`

| Excel字段 | 当前来源 | 当前状态 | 建议后端字段结构 | 备注 |
| --- | --- | --- | --- | --- |
| 正常流程转接-人数 | 前端推导 | 待接口 | `scene_transfer_items[].transfer_num` | 当前按剩余转人工量比例拆分 |
| 客户需求转人工-人数 | 前端推导 | 待接口 | `scene_transfer_items[].transfer_num` | 同上 |
| 无法解答问题转接-人数 | `/rate/all_num` | 部分已接 | `can_not_answer_and_transfer_num` 或场景数组中返回 | 已有总数 |
| 情绪问题转接-人数 | 前端推导 | 待接口 | `scene_transfer_items[].transfer_num` | 当前无真实接口 |
| 售后类问题转接-人数 | 前端推导 | 待接口 | `scene_transfer_items[].transfer_num` | 当前无真实接口 |
| 各场景占比（统计整体） | 前端计算 | 待接口 | `scene_transfer_items[].transfer_rate` | 当前按人数 / 总转人工量 |

建议返回示例：

```json
{
  "scene_transfer_summary": {
    "total_transfer_num": 1800,
    "base_label": "统计整体"
  },
  "scene_transfer_items": [
    {
      "scene_key": "normal_flow",
      "scene_label": "正常流程转接",
      "transfer_num": 354,
      "transfer_rate": 19.67
    },
    {
      "scene_key": "customer_demand",
      "scene_label": "客户需求转人工",
      "transfer_num": 307,
      "transfer_rate": 17.06
    },
    {
      "scene_key": "can_not_answer",
      "scene_label": "无法解答问题转接",
      "transfer_num": 620,
      "transfer_rate": 34.44
    },
    {
      "scene_key": "emotion_issue",
      "scene_label": "情绪问题转接",
      "transfer_num": 189,
      "transfer_rate": 10.50
    },
    {
      "scene_key": "after_sales",
      "scene_label": "售后类问题转接",
      "transfer_num": 330,
      "transfer_rate": 18.33
    }
  ]
}
```

## 5. 建议接口方案

如果想最省改动，可以继续扩展现有 `/rate/all_num` 返回结构，在原有字段之外补：

```json
{
  "code": 0,
  "message": "",
  "data": {
    "all_num": 9000,
    "transfer_num": 1800,
    "can_not_answer_and_transfer_num": 620,
    "no_trade_num": 2100,
    "no_trade_and_success": 360,
    "store_total_reception_num": 10000,
    "ai_reception_coverage_rate": 90,
    "ai_auto_reception_num": 7200,
    "ai_auto_reception_rate": 80,
    "ai_assist_reception_num": 1800,
    "ai_assist_reception_rate": 20,
    "auto_efficiency_rows": [],
    "assist_efficiency": {},
    "scene_transfer_summary": {},
    "scene_transfer_items": []
  }
}
```

优点：
- 前端改动最小，继续复用 `getAllNumCached`
- 日期筛选、缓存逻辑不用重写

缺点：
- `/rate/all_num` 语义会越来越大
- 如果后面“问题覆盖看板”也走 Excel 化，建议拆成独立接口

## 6. 当前前端已落地文件

- 页面结构：[index.html](/Users/hejiadong/project/customer_service_board/index.html)
- 数据映射：[js/main.js](/Users/hejiadong/project/customer_service_board/js/main.js)
- 默认假数据与推导参数：[js/mock-data.js](/Users/hejiadong/project/customer_service_board/js/mock-data.js)
- 样式：[css/style.css](/Users/hejiadong/project/customer_service_board/css/style.css)

## 7. 对接优先级建议

P1：
- `store_total_reception_num`
- `ai_auto_reception_num`
- `ai_assist_reception_num`
- `auto_efficiency_rows`
- `assist_efficiency`
- `scene_transfer_items`

P2：
- 后端直接返回金额、转化率、客单价，减少前端计算
- 返回口径说明字段，避免客户后续追问“分母是什么”
