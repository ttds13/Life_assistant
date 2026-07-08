<script lang="ts" setup>
import { companyConsultPhoneText, companyInfo } from '@/constants/company'

definePage({
  style: {
    navigationBarTitleText: '隐私政策',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
  },
  excludeLoginPath: true,
})

const sections = [
  {
    title: '一、我们如何收集信息',
    items: [
      '当您绑定手机号、预约服务、提交地址、上传图片、申请售后或联系客服时，我们会收集为完成相应功能所必需的信息。',
      '常见信息包括手机号、昵称、头像、服务地址、订单信息、支付状态、售后沟通内容、上传的服务相关图片及设备基础信息。',
      '我们仅在您主动提交、授权或使用具体功能时收集相关信息，不会超出实现服务目的所需范围。',
    ],
  },
  {
    title: '二、我们如何使用信息',
    items: [
      '用于账号识别、手机号绑定、订单创建、服务派单、履约沟通、支付核验、售后处理和客服支持。',
      '用于保障交易安全、排查异常、改进服务质量、处理投诉争议及符合法律法规要求的留存。',
      '如需将信息用于本政策未载明的其他用途，我们会再次征得您的授权或通过页面提示告知。',
    ],
  },
  {
    title: '三、权限与敏感信息说明',
    items: [
      '手机号用于账号绑定、订单联系和安全校验。',
      '地址信息用于上门服务定位、订单履约和服务范围判断。',
      '相册、拍照权限仅在您上传头像、服务照片、售后凭证等场景主动触发时使用。',
      '位置信息仅在您选择定位、地址识别或服务范围判断时使用，您也可以手动填写地址。',
    ],
  },
  {
    title: '四、信息共享与第三方处理',
    items: [
      '为完成服务，我们可能向实际服务人员展示必要的订单信息、联系人信息和服务地址。',
      '涉及支付、地图、消息通知、对象存储等能力时，可能由相应第三方服务提供基础技术支持。',
      '除法律法规要求、取得您授权或完成服务所必需外，我们不会向无关第三方出售、出租或公开披露您的个人信息。',
    ],
  },
  {
    title: '五、信息保存与安全',
    items: [
      '我们会在实现服务目的所需期限内保存您的个人信息。法律法规另有规定的，从其规定。',
      '我们采用访问控制、日志审计、传输保护等措施保护信息安全，并限制工作人员接触个人信息的范围。',
      '互联网环境并非绝对安全，如发生个人信息安全事件，我们将依法采取补救措施并按要求告知。',
    ],
  },
  {
    title: '六、您的权利',
    items: [
      '您可以在小程序内查看或更新账号资料、地址信息、订单信息等内容。',
      '您可以通过客服或反馈入口申请更正、删除个人信息，或申请注销账号。我们会在核验身份后依法处理。',
      '您可以在系统设置中关闭相册、相机、位置等权限。关闭后，相关功能可能无法正常使用。',
    ],
  },
  {
    title: '七、未成年人保护',
    items: [
      '未成年人使用本服务前，应取得监护人同意并在监护人指导下使用。',
      '如我们发现未经监护人同意收集了未成年人个人信息，将依法尽快删除或采取其他必要措施。',
    ],
  },
  {
    title: '八、个人信息处理者与联系',
    items: [
      `个人信息处理者/运营服务品牌：${companyInfo.brandName}。`,
      `联系地址：${companyInfo.address}。`,
      `门店热线：${companyInfo.hotline}；服务咨询：${companyConsultPhoneText}。`,
      '如您需要查询、更正、删除个人信息，或申请注销账号，可通过上述联系方式或小程序内客服、反馈入口与我们联系。',
    ],
  },
  {
    title: '九、政策更新',
    items: [
      '我们可能根据产品功能、业务规则或法律法规变化更新本政策，并在页面中公示最新版本。',
      '如您对个人信息处理有疑问、投诉或建议，可通过小程序内客服、反馈入口与我们联系。',
    ],
  },
]
</script>

<template>
  <scroll-view scroll-y class="legal-page">
    <view class="legal-content">
      <view class="header">
        <text class="title">隐私政策</text>
        <text class="meta">更新日期：2026年7月7日</text>
        <text class="meta">生效日期：2026年7月7日</text>
      </view>

      <view class="intro">
        <text>
          {{ companyInfo.appName }}重视您的个人信息和隐私保护。本政策说明我们在提供服务过程中如何收集、使用、保存、共享和保护您的个人信息，以及您如何行使相关权利。
        </text>
      </view>

      <view class="contact-card">
        <text class="contact-title">个人信息处理者联系方式</text>
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
