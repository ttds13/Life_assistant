-- CreateTable
CREATE TABLE `support_faqs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `category` VARCHAR(64) NOT NULL,
  `question` VARCHAR(255) NOT NULL,
  `answer` TEXT NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `status` SMALLINT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX `support_faqs_category_idx`(`category`),
  INDEX `support_faqs_status_idx`(`status`),
  INDEX `support_faqs_sort_order_idx`(`sort_order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_configs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(32) NOT NULL DEFAULT '0469-8596888',
  `wechat_id` VARCHAR(64) NOT NULL DEFAULT '15645777033 / 13384692200',
  `service_hours` VARCHAR(64) NOT NULL DEFAULT '09:00-21:00',
  `response_time` VARCHAR(128) NOT NULL DEFAULT '工作时间内通常 30 分钟内响应',
  `online_enabled` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `support_configs` (`phone`, `wechat_id`, `service_hours`, `response_time`, `online_enabled`)
VALUES ('0469-8596888', '15645777033 / 13384692200', '09:00-21:00', '工作时间内通常 30 分钟内响应', true);

INSERT INTO `support_faqs` (`category`, `question`, `answer`, `sort_order`, `status`)
VALUES
  ('订单与支付', '下单后多久会有师傅接单？', '平台会优先匹配同城可服务师傅。待派单订单请保持电话畅通，若长时间无人接单，可在订单详情中取消或联系客服处理。', 10, 1),
  ('订单与支付', '订单支付后还能修改预约时间吗？', '待支付或待派单订单支持在订单详情中修改预约时间。师傅接单后如需改期，请通过售后或客服协助处理。', 20, 1),
  ('退款与售后', '取消已支付订单后多久退款？', '已支付订单取消后会进入退款审核。审核通过后平台提交支付渠道退款，到账时间以支付渠道实际处理为准。', 30, 1),
  ('退款与售后', '服务完成后有问题怎么办？', '可在订单详情点击申请售后，提交问题描述和图片凭证。平台处理后会在售后详情中同步进度。', 40, 1),
  ('会员卡使用', '会员卡预约取消后次数会退回吗？', '使用会员卡预约的订单取消后，会释放本次冻结的次数或额度，不走现金退款流程。', 50, 1),
  ('师傅服务', '如何申请成为平台师傅？', '在我的页点击申请师傅，填写基础信息、服务城市、技能和资质说明。提交后平台会进行人工审核。', 60, 1),
  ('师傅服务', '师傅申请提交后在哪里查看进度？', '再次进入申请师傅页面即可查看当前审核状态。审核通过后，我的页会展示师傅端入口。', 70, 1),
  ('账号与登录', '更换手机号后怎么办？', '当前手机号来自登录授权信息。如需更换账号手机号，请先联系客服核实身份后处理。', 80, 1);
