export const ORDER_ACTION = {
  CREATE_ORDER: 'create_order',
  PAY_SUCCESS: 'pay_success',
  ADMIN_ASSIGN: 'admin_assign',
  STAFF_ACCEPT: 'staff_accept',
  STAFF_REJECT: 'staff_reject',
  STAFF_ON_THE_WAY: 'staff_on_the_way',
  STAFF_START: 'staff_start',
  STAFF_COMPLETE: 'staff_complete',
  USER_CONFIRM: 'user_confirm',
  USER_CANCEL_UNPAID: 'user_cancel_unpaid',
  TIMEOUT_UNPAID: 'timeout_unpaid',
  AUTO_CONFIRM: 'auto_confirm',
} as const

export type OrderAction = typeof ORDER_ACTION[keyof typeof ORDER_ACTION]

export const ORDER_ACTION_VALUES = Object.values(ORDER_ACTION)
