/**
 * AI客服数据看板 - 模拟数据
 * 根据需求文档整理的P1优先级指标数据
 */

const generalQuestionTagGroups = [
  {
    label: '物流/发货问题',
    tags: ['送货上门', '未发货改地址', '发货时长', '发货地址', '收货时长', '发货快递', '到货时间', '改地址', '拦截']
  },
  {
    label: '退款操作说明',
    tags: ['购物金退款', '退货申请', '差价申请', '差价超7天', '差价7天内', '拦截退款', '过敏同框照']
  },
  {
    label: '敏感话题回复',
    tags: ['质检报告', '营业执照', '中文标签', '成分表', '三无产品', '中国销售', 'FDA标准', '工厂信息', '中国生产', '苏州工厂', '不同店铺', '品牌', '产地', '旗舰店', '进口化妆品']
  },
  {
    label: '售后相关',
    tags: ['差价规则', '虚假签收', '7天退货不支持', '安抚', '过敏测试', '破损', '丢件', '催件', '头屑&头痒', '晚到必赔', '退款挽留', '差评投诉', '预警升级', '飞机高铁', '发票', '保质期']
  },
  {
    label: '产品用量&方法',
    tags: ['洗发水用量', '洗发水用法', '洗发水泡沫', '湿发固色用量', '湿发固色用法', '干发染色用量', '干发染色用法', '干发染色警告', '固色发膜用法', '滴滴染用法', '洗发水对比', '洗发水补色', '固色套组使用方法']
  }
];

const productQuestionTagGroups = [
  {
    label: '固色产品通用用量&方法',
    tags: ['洗发水用量', '洗发水用法', '洗发水泡沫', '湿发固色用量', '湿发固色用法', '干发染色用量', '干发染色用法', '干发染色警告', '固色发膜用法', '洗发水对比', '洗发水补色', '固色套组使用方法']
  },
  {
    label: '固色套组',
    tags: ['灰棕注意事项', '雾霾灰&银灰色区别', '灰发注意事项', '银发&白发的区别', '粉色注意事项', '去黄和紫色区别', '去绿推荐']
  },
  {
    label: '去黄套组',
    tags: ['去黄套组使用方法', '去黄适用度数', '去黄原理', '白金预期管理']
  },
  {
    label: '去绿相关',
    tags: ['去绿使用频率', '去绿适用发色', '去绿原理', '去绿用法', '去绿非漂染', '去绿没效果', '去绿用后变粉', '去绿担忧变粉', '去绿能否固色', '去绿与粉色区别', '去绿预期']
  },
  {
    label: '卷卷精油相关',
    tags: ['卷卷精油详细成分', '卷卷精油和直板夹', '卷卷精油卷烫后使用', '卷卷精油使用手法', '卷卷精油介绍', '卷卷精油卷发后使用', '卷卷精油效果', '卷卷精油容量', '卷卷精油分层有泡沫', '卷卷精油普通精油区别', '卷卷精油喷雾发胶区别', '卷卷精油料体', '卷卷精油气味', '卷卷精油成分', '卷卷精油各种卷发形式', '卷卷精油卷发前使用', '卷卷精油不卷发人群', '卷卷精油摇匀', '卷卷精油用法', '卷卷精油定型成因', '卷卷精油作用']
  },
  {
    label: '一号发膜相关',
    tags: ['一号发膜用法', '洗前发膜和护发素的区别', '洗前发膜成分', '洗前发膜介绍']
  }
];

function buildQuestionTemplates(groups, prefix) {
  return groups.flatMap((group, groupIndex) =>
    group.tags.map((tag, tagIndex) => ({
      key: `${prefix}-${groupIndex + 1}-${tagIndex + 1}`,
      label: group.label,
      subLabel: tag,
      weight: 1
    }))
  );
}

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

  // Excel 版看板默认值（用于首页 4 个 tab 的推导展示）
  dashboardWorkbookDefaults: {
    storeTotalReception: 10000,
    aiReceptionCount: 9000,
    aiCoverageRate: 0.9,
    transferCount: 1800,
    noAnswerTransferCount: 620,
    threeSentenceConversationCount: 260,
    inquiryCount: 2100,
    paymentCount: 360
  },

  dashboardWorkbookAssumptions: {
    autoShortInquiryShare: 0.2,
    autoShortPaymentShare: 0.12,
    autoShortAverageOrderValue: 158,
    autoLongAverageOrderValue: 236,
    assistInquiryRate: 0.44,
    assistPaymentRate: 0.21,
    assistAverageOrderValue: 288,
    sceneDistribution: {
      normalFlow: 0.3,
      customerDemand: 0.26,
      emotionIssue: 0.16,
      afterSales: 0.28
    }
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

  unansweredDetailBoard: {
    summaryDistribution: {
      presaleConsultShare: 0.68,
      presaleAnsweredShare: 0.7
    },
    generalQuestionTemplates: buildQuestionTemplates(generalQuestionTagGroups, 'general'),
    productQuestionTemplates: buildQuestionTemplates(productQuestionTagGroups, 'product'),
    detailSamples: {
      logistics: [
        { buyerNick: 'huahua88', sellerNick: '旗舰店客服', issue: '物流催发货咨询未命中', question: '为什么我的订单还没发货？', createdAt: '2026-03-15 14:20', conversationId: 'mock-logistics-001' },
        { buyerNick: 'bluecat', sellerNick: '旗舰店客服', issue: '发货节点解释不完整', question: '今天能帮我安排发出吗？', createdAt: '2026-03-15 10:44', conversationId: 'mock-logistics-002' },
        { buyerNick: 'qinqin', sellerNick: '旗舰店客服', issue: '物流状态追问', question: '仓库打单后多久会揽收？', createdAt: '2026-03-14 19:02', conversationId: 'mock-logistics-003' }
      ],
      shipping: [
        { buyerNick: 'hikari', sellerNick: '旗舰店客服', issue: '发货时效说明缺失', question: '现在拍什么时候能发？', createdAt: '2026-03-15 13:16', conversationId: 'mock-shipping-001' },
        { buyerNick: 'momo_q', sellerNick: '旗舰店客服', issue: '节假日发货规则未覆盖', question: '周末还会发货吗？', createdAt: '2026-03-14 18:15', conversationId: 'mock-shipping-002' }
      ],
      image: [
        { buyerNick: 'jojo77', sellerNick: '旗舰店客服', issue: '图片识别流程中断', question: '我给你发图了，怎么没回复？', createdAt: '2026-03-15 21:32', conversationId: 'mock-image-001' },
        { buyerNick: 'linda88', sellerNick: '旗舰店客服', issue: '图片内容解析失败', question: '这张头发图片适合哪个产品？', createdAt: '2026-03-14 11:28', conversationId: 'mock-image-002' }
      ],
      'general-other': [
        { buyerNick: 'summer-x', sellerNick: '旗舰店客服', issue: '通用问题未匹配', question: '可以顺丰到付吗？', createdAt: '2026-03-13 16:49', conversationId: 'mock-general-001' },
        { buyerNick: 'tata', sellerNick: '旗舰店客服', issue: '政策类问题未命中', question: '会员折扣怎么用？', createdAt: '2026-03-13 09:24', conversationId: 'mock-general-002' }
      ],
      'oil-usage': [
        { buyerNick: 'fafa77', sellerNick: '旗舰店客服', issue: '商品用法未覆盖', question: '卷卷精油是湿发用还是干发用？', createdAt: '2026-03-15 15:17', conversationId: 'mock-oil-001' },
        { buyerNick: 'Nora', sellerNick: '旗舰店客服', issue: '剂量说明不完整', question: '一次按几泵比较合适？', createdAt: '2026-03-14 20:35', conversationId: 'mock-oil-002' }
      ],
      'mask-color': [
        { buyerNick: 'iris02', sellerNick: '旗舰店客服', issue: '适用发质未命中', question: '固色发膜适合漂过的头发吗？', createdAt: '2026-03-14 17:11', conversationId: 'mock-mask-001' }
      ],
      'shampoo-color': [
        { buyerNick: 'dudu', sellerNick: '旗舰店客服', issue: '使用频率未命中', question: '固色洗发水一周用几次？', createdAt: '2026-03-15 09:58', conversationId: 'mock-shampoo-001' }
      ],
      'mask-no1': [
        { buyerNick: 'alice_h', sellerNick: '旗舰店客服', issue: '搭配使用场景缺失', question: '1号发膜和护发精油先用哪个？', createdAt: '2026-03-13 20:10', conversationId: 'mock-no1-001' }
      ],
      'product-other': [
        { buyerNick: 'flora', sellerNick: '旗舰店客服', issue: '商品咨询泛化未命中', question: '有没有适合孕妇用的染护产品？', createdAt: '2026-03-15 12:06', conversationId: 'mock-product-001' },
        { buyerNick: 'binbin', sellerNick: '旗舰店客服', issue: '组合推荐未覆盖', question: '我想同时买洗发水和发膜有推荐吗？', createdAt: '2026-03-12 14:41', conversationId: 'mock-product-002' }
      ]
    }
  },

  // 转人工场景关注维度（用于首页看板）
  handoverSceneStats: [
    {
      id: 1,
      name: '态度问题',
      transferCount: 308,
      description: '用户对回复语气不满意后转人工',
      status: 'warning'
    },
    {
      id: 2,
      name: '用户拒绝发图',
      transferCount: 196,
      description: '需图像信息但用户不愿补充图片',
      status: 'danger'
    },
    {
      id: 3,
      name: '物流-售后问题',
      transferCount: 552,
      description: '物流异常、退款进度、售后追踪类咨询',
      status: 'info'
    },
    {
      id: 4,
      name: '知识库问答-找不到知识',
      transferCount: 456,
      description: '知识库未命中有效答案后转人工',
      status: 'danger'
    }
  ],

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
