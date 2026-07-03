export const ORDER_ACTION = {
  CREATE_ORDER: 'create_order',
  PAY_SUCCESS: 'pay_success',
  ADMIN_ASSIGN: 'admin_assign',
  AUTO_ASSIGN: 'auto_assign',
  STAFF_ACCEPT: 'staff_accept',
  STAFF_REJECT: 'staff_reject',
  STAFF_CLAIM: 'staff_claim',
  STAFF_ON_THE_WAY: 'staff_on_the_way',
  STAFF_START: 'staff_start',
  STAFF_COMPLETE: 'staff_complete',
  USER_CONFIRM: 'user_confirm',
  USER_CANCEL_UNPAID: 'user_cancel_unpaid',
  USER_CANCEL_BOOKING: 'user_cancel_booking',
  USER_CANCEL_PAID_REFUND: 'user_cancel_paid_refund',
  TIMEOUT_UNPAID: 'timeout_unpaid',
  AUTO_CONFIRM: 'auto_confirm',
} as const

export type OrderAction = typeof ORDER_ACTION[keyof typeof ORDER_ACTION]

export const ORDER_ACTION_VALUES = Object.values(ORDER_ACTION)
