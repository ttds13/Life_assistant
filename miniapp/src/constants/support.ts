import type { FeedbackType } from '@/api/types/support'
import { companyConsultPhoneText, companyInfo } from './company'

export interface FaqItem {
  id: string
  category: string
  question: string
  answer: string
}

export const supportConfig = {
  phone: companyInfo.hotline,
  wechatId: companyConsultPhoneText,
  serviceHours: '09:00-21:00',
  responseTime: '工作时间内通常 30 分钟内响应',
}

export const staffSkillOptions = [
  '保洁清洗',
  '家电维修',
  '管道疏通',
  '开锁换锁',
  '搬家跑腿',
  '养老陪护',
  '家庭维修',
  '其他服务',
]

export const feedbackTypeOptions: Array<{ label: string, value: FeedbackType }> = [
  { label: '功能异常', value: 'bug' },
  { label: '订单问题', value: 'order' },
  { label: '支付退款', value: 'payment_refund' },
  { label: '服务体验', value: 'service_experience' },
  { label: '产品建议', value: 'suggestion' },
  { label: '其他', value: 'other' },
]

export const faqCategories = ['全部', '订单与支付', '退款与售后', '会员卡使用', '师傅服务', '账号与登录']

export const faqItems: FaqItem[] = [
  {
    id: 'order-create',
    category: '订单与支付',
    question: '下单后多久会有师傅接单？',
    answer: '平台会优先匹配同城可服务师傅。待派单订单请保持电话畅通，若长时间无人接单，可在订单详情中取消或联系客服处理。',
  },
  {
    id: 'order-pay',
    category: '订单与支付',
    question: '订单支付后还能修改预约时间吗？',
    answer: '待支付或待派单订单支持在订单详情中修改预约时间。师傅接单后如需改期，请通过售后或客服协助处理。',
  },
  {
    id: 'refund-flow',
    category: '退款与售后',
    question: '取消已支付订单后多久退款？',
    answer: '已支付订单取消后会进入退款审核。审核通过后平台提交支付渠道退款，到账时间以支付渠道实际处理为准。',
  },
  {
    id: 'after-sales',
    category: '退款与售后',
    question: '服务完成后有问题怎么办？',
    answer: '可在订单详情点击申请售后，提交问题描述和图片凭证。平台处理后会在售后详情中同步进度。',
  },
  {
    id: 'member-card',
    category: '会员卡使用',
    question: '会员卡预约取消后次数会退回吗？',
    answer: '使用会员卡预约的订单取消后，会释放本次冻结的次数或额度，不走现金退款流程。',
  },
  {
    id: 'staff-apply',
    category: '师傅服务',
    question: '如何申请成为平台师傅？',
    answer: '在我的页点击申请师傅，填写基础信息、服务城市、技能和资质说明。提交后平台会进行人工审核。',
  },
  {
    id: 'staff-status',
    category: '师傅服务',
    question: '师傅申请提交后在哪里查看进度？',
    answer: '再次进入申请师傅页面即可查看当前审核状态。审核通过后，我的页会展示师傅端入口。',
  },
  {
    id: 'login-phone',
    category: '账号与登录',
    question: '更换手机号后怎么办？',
    answer: '当前手机号来自登录授权信息。如需更换账号手机号，请先联系客服核实身份后处理。',
  },
]
