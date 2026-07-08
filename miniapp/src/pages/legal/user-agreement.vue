<script lang="ts" setup>
import { companyConsultPhoneText, companyInfo } from '@/constants/company'

definePage({
  style: {
    navigationBarTitleText: '用户协议',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
  excludeLoginPath: true,
})

const sections = [
  {
    title: '一、协议范围',
    items: [
      '本协议适用于您使用生活助手小程序提供的家政、保洁、维修、到家服务预约及相关辅助功能。',
      '您点击同意、绑定手机号、下单或继续使用本服务，即表示您已阅读、理解并同意本协议。',
    ],
  },
  {
    title: '二、账号与手机号绑定',
    items: [
      '为完成预约、订单通知、售后处理和服务安全校验，您需要绑定本人可正常使用的手机号。',
      '您应确保提交的信息真实、准确、完整。因信息错误导致无法联系、无法履约或产生损失的，由您自行承担相应后果。',
    ],
  },
  {
    title: '三、服务预约与履约',
    items: [
      '您可根据页面展示选择服务项目、服务地址、预约时间和补充说明，系统将根据业务规则生成订单。',
      '服务人员会按照订单信息提供服务。如需变更时间、地址或服务内容，请在服务开始前通过订单页或客服入口处理。',
      '页面展示的价格、优惠、会员卡权益以提交订单时的有效规则为准。',
    ],
  },
  {
    title: '四、支付、取消与退款',
    items: [
      '涉及在线支付的订单，应以支付页面和订单详情页展示的信息为准。',
      '订单取消、退款、售后申请等按照平台公示规则、订单状态和实际服务履约情况处理。',
      '如因不可抗力、地址无法进入、用户失联等原因导致服务无法完成，平台可根据实际情况调整订单状态或协助双方处理。',
    ],
  },
  {
    title: '五、用户行为规范',
    items: [
      '您不得提交违法、虚假、侵权、骚扰、欺诈或影响服务安全的信息。',
      '您不得利用本服务从事刷单、恶意投诉、规避平台交易、干扰系统运行等行为。',
      '如您违反本协议或相关法律法规，平台有权限制部分功能、暂停服务或依法保留追究责任的权利。',
    ],
  },
  {
    title: '六、平台责任边界',
    items: [
      '平台将尽合理努力维护服务稳定、安全和订单信息准确，但不承诺服务在任何情况下均不间断或无错误。',
      '因网络故障、系统维护、第三方服务异常、不可抗力等非平台可控原因造成的影响，平台将在合理范围内协助处理。',
    ],
  },
  {
    title: '七、协议更新与联系',
    items: [
      `运营服务品牌：${companyInfo.brandName}（${companyInfo.serviceScope}）。`,
      `联系地址：${companyInfo.address}。`,
      `门店热线：${companyInfo.hotline}；服务咨询：${companyConsultPhoneText}。`,
      '平台可根据业务调整、法律法规变化或产品功能更新修订本协议，并在页面中公示最新版本。',
      '如您对本协议或订单服务有疑问，可通过小程序内客服、反馈入口与我们联系。',
    ],
  },
]
</script>

<template>
  <scroll-view scroll-y class="legal-page">
    <view class="legal-content">
      <view class="header">
        <text class="title">用户协议</text>
        <text class="meta">更新日期：2026年7月7日</text>
        <text class="meta">生效日期：2026年7月7日</text>
      </view>

      <view class="intro">
        <text>
          欢迎使用{{ companyInfo.appName }}。请您在使用服务前仔细阅读本协议，重点关注账号绑定、订单履约、支付退款、用户行为规范及责任边界等条款。
        </text>
      </view>

      <view class="contact-card">
        <text class="contact-title">运营与联系方式</text>
        <text class="contact-line">服务品牌：{{ companyInfo.brandName }}</text>
        <text class="contact-line">联系地址：{{ companyInfo.address }}</text>
        <text class="contact-line">门店热线：{{ companyInfo.hotline }}</text>
        <text class="contact-line">服务咨询：{{ companyConsultPhoneText }}</text>
      </view>

      <view v-for="section in sections" :key="section.title" class="section">
        <text class="section-title">{{ section.title }}</text>
        <view v-for="item in section.items" :key="item" class="paragraph">
          <text>{{ item }}</text>
        </view>
      </view>
    </view>
  </scroll-view>
</template>

<style scoped>
.legal-page {
  min-height: 100vh;
  background: #f5f7fa;
}

.legal-content {
  padding: 40rpx 32rpx calc(env(safe-area-inset-bottom) + 48rpx);
}

.header {
  display: flex;
  flex-direction: column;
  margin-bottom: 28rpx;
}

.title {
  color: #111827;
  font-size: 40rpx;
  font-weight: 600;
  line-height: 56rpx;
}

.meta {
  margin-top: 8rpx;
  color: #6b7280;
  font-size: 24rpx;
  line-height: 36rpx;
}

.intro,
.section,
.contact-card {
  margin-top: 20rpx;
  padding: 28rpx;
  border-radius: 16rpx;
  background: #ffffff;
}

.intro text,
.paragraph text {
  color: #374151;
  font-size: 28rpx;
  line-height: 46rpx;
}

.section-title {
  display: block;
  margin-bottom: 16rpx;
  color: #111827;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 44rpx;
}

.paragraph {
  margin-top: 12rpx;
}

.contact-title {
  display: block;
  margin-bottom: 16rpx;
  color: #111827;
  font-size: 30rpx;
  font-weight: 600;
  line-height: 44rpx;
}

.contact-line {
  display: block;
  margin-top: 10rpx;
  color: #374151;
  font-size: 28rpx;
  line-height: 44rpx;
}
</style>
