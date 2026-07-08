export const ORDER_ACTION = {
  CREATE_ORDER: 'create_order',
  ADMIN_CREATE_ORDER: 'admin_create_order',
  PAY_SUCCESS: 'pay_success',
  ADMIN_ASSIGN: 'admin_assign',
  AUTO_ASSIGN: 'auto_assign',
  STAFF_ACCEPT: 'staff_accept',
  STAFF_REJECT: 'staff_reject',
  STAFF_ON_THE_WAY: 'staff_on_the_way',
  STAFF_START: 'staff_start',
  STAFF_COMPLETE: 'staff_complete',
  USER_CONFIRM: 'user_confirm',
  USER_CANCEL_UNPAID: 'user_cancel_unpaid',
  USER_CANCEL_BOOKING: 'user_cancel_booking',
  USER_CANCEL_PAID_REFUND: 'user_cancel_paid_refund',
  USER_REQUEST_REFUND: 'user_request_refund',
  ADMIN_REFUND_APPROVE: 'admin_refund_approve',
  ADMIN_REFUND_REJECT: 'admin_refund_reject',
  REFUND_PROCESSING: 'refund_processing',
  REFUND_SUCCESS: 'refund_success',
  REFUND_FAIL: 'refund_fail',
  AFTER_SALES_REQUEST: 'after_sales_request',
  AFTER_SALES_CLOSE: 'after_sales_close',
  TIMEOUT_UNPAID: 'timeout_unpaid',
  AUTO_CONFIRM: 'auto_confirm',
} as const

export type OrderAction = typeof ORDER_ACTION[keyof typeof ORDER_ACTION]

export const ORDER_ACTION_VALUES = Object.values(ORDER_ACTION)
