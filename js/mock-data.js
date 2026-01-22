/**
 * AI客服数据看板 - 模拟数据
 */

export const MockData = {
  // 核心统计指标
  stats: {
    aiReceptionTotal: {
      value: 49767,
      change: 12.5,
      trend: 'up'
    },
    noResponseCount: {
      value: 124,
      change: 2.1,
      trend: 'up'
    },
    handoverToHuman: {
      value: 1512,
      change: -5.3,
      trend: 'down'
    },
    handoverRate: {
      value: 3.04,
      change: 4.2,
      trend: 'up',
      suffix: '%'
    },
    inquiryConversion: {
      value: 14.2,
      change: 0.8,
      trend: 'up',
      suffix: '%'
    }
  },

  // 询单相关统计（三日内）
  inquiryStats: {
    inquiryCount: 8234,
    paymentCount: 1170,
    conversionRate: 14.2
  },

  // 接待趋势数据（7天）
  trendData: {
    labels: ['1月16日', '1月17日', '1月18日', '1月19日', '1月20日', '1月21日', '1月22日'],
    aiReception: [6500, 7200, 7800, 6900, 7500, 8100, 7600],
    humanHandover: [180, 210, 250, 190, 220, 280, 240]
  },

  // 问题覆盖率统计
  coverageStats: {
    totalQuestions: 49767,
    answeredQuestions: 45311,
    coverageRate: 91.0,
    weeklyChange: 12.5
  },

  // 问题分类优化列表
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

  // 待优化问题列表
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
  ],

  // 客服团队
  staffMembers: [
    { id: 1, name: '张三', saved: 1 },
    { id: 2, name: '李四', saved: 0 },
    { id: 3, name: '王五', saved: 2 },
    { id: 4, name: '其他', saved: 6 }
  ]
};
