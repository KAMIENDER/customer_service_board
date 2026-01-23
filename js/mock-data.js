/**
 * AI客服数据看板 - 模拟数据
 * 根据需求文档整理的P1优先级指标数据
 */

export const MockData = {
  // ========================================
  // 第一个Tab：辅助售前接待效率 (P1)
  // ========================================
  
  // 核心统计指标 - 每日统计
  receptionStats: {
    // AI接待人数 - AI客服介入下接待的总体人数
    aiReceptionTotal: {
      value: 49767,
      change: 12.5,
      trend: 'up',
      definition: 'AI客服介入下接待的总体人数'
    },
    // AI接待三句话无响应人数 - AI问询三句内不再回复的顾客
    noResponseCount: {
      value: 124,
      change: 2.1,
      trend: 'up',
      definition: 'AI问询三句内不再回复的顾客'
    },
    // AI接待转人工人数 - AI转接人工的总人数
    handoverToHuman: {
      value: 1512,
      change: -5.3,
      trend: 'down',
      definition: 'AI转接人工的总人数'
    },
    // AI接待转接率 - AI接待转人工人数/AI接待人数
    handoverRate: {
      value: 3.04,
      change: -4.2,
      trend: 'down',
      suffix: '%',
      definition: 'AI接待转人工人数/AI接待人数'
    },
    // AI接待无法回答转人工人数 - AI无法回答的用户并转接人工的人数
    noAnswerHandover: {
      value: 856,
      change: -8.2,
      trend: 'down',
      definition: 'AI无法回答的用户并转接人工的人数'
    },
    // AI接待无法回答转接率 - AI接待无法回答转人工人数/AI接待人数
    noAnswerHandoverRate: {
      value: 1.72,
      change: -6.5,
      trend: 'down',
      suffix: '%',
      definition: 'AI接待无法回答转人工人数/AI接待人数'
    }
  },

  // 询单相关统计 - 统计三日内
  inquiryStats: {
    // AI询单人数 - AI介入下接待的无订单客户数
    inquiryCount: {
      value: 8234,
      change: 5.2,
      trend: 'up',
      definition: 'AI介入下接待的无订单客户数'
    },
    // AI询单支付人数 - AI介入接待后未转接人工即下单并支付的订单人数
    paymentCount: {
      value: 1170,
      change: 8.6,
      trend: 'up',
      definition: 'AI介入接待后未转接人工即下单并支付的订单人数'
    },
    // AI询单支付转化率 - AI询单支付人数/AI询单人数
    conversionRate: {
      value: 14.2,
      change: 0.8,
      trend: 'up',
      suffix: '%',
      definition: 'AI询单支付人数/AI询单人数'
    }
  },

  // 接待趋势数据（7天）
  trendData: {
    labels: ['1月16日', '1月17日', '1月18日', '1月19日', '1月20日', '1月21日', '1月22日'],
    aiReception: [6500, 7200, 7800, 6900, 7500, 8100, 7600],
    humanHandover: [180, 210, 250, 190, 220, 280, 240]
  },

  // ========================================
  // 第二个Tab：售前接待问题覆盖及调教 (P1)
  // ========================================
  
  // 问题覆盖率核心统计 - 每日统计
  coverageStats: {
    // 咨询问题数 - AI接待过程中受理的咨询问题总数
    totalQuestions: {
      value: 49767,
      change: 8.2,
      trend: 'up',
      definition: 'AI接待过程中受理的咨询问题总数'
    },
    // 已回复问题数 - AI接待过程中已回答的问题总数
    answeredQuestions: {
      value: 45311,
      change: 10.5,
      trend: 'up',
      definition: 'AI接待过程中已回答的问题总数'
    },
    // 问题覆盖率 - 已回复问题数/咨询问题数
    coverageRate: {
      value: 91.0,
      change: 2.3,
      trend: 'up',
      suffix: '%',
      definition: '已回复问题数/咨询问题数'
    }
  },

  // 问题覆盖趋势数据（7天）
  coverageTrendData: {
    labels: ['1月16日', '1月17日', '1月18日', '1月19日', '1月20日', '1月21日', '1月22日'],
    answered: [5800, 6200, 6500, 5900, 6400, 7000, 6500],
    unanswered: [700, 800, 650, 750, 600, 550, 600]
  },

  // 问题场景分类列表（用于话术优化）
  categoryList: [
    {
      id: 1,
      name: '订单状态查询',
      category: '售后/物流',
      volume: 12402,
      volumeTrend: '近7日',
      coverageRate: 98,
      status: 'optimized',
      issues: []
    },
    {
      id: 2,
      name: '退换货政策',
      category: '售前/政策',
      volume: 5210,
      volumeTrend: '近7日',
      coverageRate: 64,
      status: 'warning',
      issues: ['循环问答', '策略不匹配']
    },
    {
      id: 3,
      name: '发色需求咨询',
      category: '未分类',
      volume: 892,
      volumeTrend: '上升中',
      coverageRate: 12,
      status: 'danger',
      issues: ['场景未开启']
    },
    {
      id: 4,
      name: '优惠活动咨询',
      category: '售前/促销',
      volume: 3400,
      volumeTrend: '稳定',
      coverageRate: 88,
      status: 'optimized',
      issues: []
    },
    {
      id: 5,
      name: '用户发送图片',
      category: '通用/媒体',
      volume: 1105,
      volumeTrend: '近7日',
      coverageRate: 45,
      status: 'danger',
      issues: ['识别失败']
    }
  ],

  // 待优化话术列表
  pendingScripts: [
    {
      type: '产品使用问题',
      example: '这款产品怎么使用？',
      status: '话术不完整',
      statusClass: 'warning',
      frequency: 856
    },
    {
      type: '发色咨询',
      example: '白金发色应该怎么处理？',
      status: '缺少场景',
      statusClass: 'danger',
      frequency: 523
    },
    {
      type: '促销活动',
      example: '现在有什么优惠活动？',
      status: '需要更新',
      statusClass: 'info',
      frequency: 412
    },
    {
      type: '配送时效',
      example: '发货后几天能到？',
      status: '话术不完整',
      statusClass: 'warning',
      frequency: 389
    }
  ],

  // 待优化问题列表（接待效率页面用）
  pendingIssues: [
    {
      id: 1,
      topic: '产品规格 - Model X',
      description: '用户咨询电压兼容性',
      issue: '低置信度',
      frequency: 588,
      action: '优化'
    },
    {
      id: 2,
      topic: '配送时效查询',
      description: '偏远地区配送时间',
      issue: '无法回答',
      frequency: 342,
      action: '创建场景'
    },
    {
      id: 3,
      topic: '发色建议',
      description: '白金发色处理流程',
      issue: '流程错误',
      frequency: 256,
      action: '调整流程'
    }
  ]
};
