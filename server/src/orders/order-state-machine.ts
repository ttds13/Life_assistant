import { ORDER_ACTION, OrderAction } from './constants/order-action'
import { ORDER_STATUS, OrderStatus } from './constants/order-status'

export type OrderLockMode = 'optimistic' | 'pessimistic'

export interface OrderTransitionRule {
  from: OrderStatus | OrderStatus[] | null
  to: OrderStatus
  lockMode: OrderLockMode
}

export const ORDER_TRANSITIONS = {
  [ORDER_ACTION.CREATE_ORDER]: {
    from: null,
    to: ORDER_STATUS.PENDING_PAYMENT,
    lockMode: 'optimistic',
  },
  [ORDER_ACTION.ADMIN_CREATE_ORDER]: {
    from: null,
    to: ORDER_STATUS.PENDING_DISPATCH,
    lockMode: 'optimistic',
  },
  [ORDER_ACTION.PAY_SUCCESS]: {
    from: ORDER_STATUS.PENDING_PAYMENT,
    to: ORDER_STATUS.PENDING_DISPATCH,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.ADMIN_ASSIGN]: {
    from: ORDER_STATUS.PENDING_DISPATCH,
    to: ORDER_STATUS.DISPATCHED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.AUTO_ASSIGN]: {
    from: ORDER_STATUS.PENDING_DISPATCH,
    to: ORDER_STATUS.DISPATCHED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.STAFF_ACCEPT]: {
    from: ORDER_STATUS.DISPATCHED,
    to: ORDER_STATUS.ACCEPTED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.STAFF_REJECT]: {
    from: ORDER_STATUS.DISPATCHED,
    to: ORDER_STATUS.PENDING_DISPATCH,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.STAFF_ON_THE_WAY]: {
    from: ORDER_STATUS.ACCEPTED,
    to: ORDER_STATUS.ON_THE_WAY,
    lockMode: 'optimistic',
  },
  [ORDER_ACTION.STAFF_START]: {
    from: ORDER_STATUS.ON_THE_WAY,
    to: ORDER_STATUS.IN_SERVICE,
    lockMode: 'optimistic',
  },
  [ORDER_ACTION.STAFF_COMPLETE]: {
    from: ORDER_STATUS.IN_SERVICE,
    to: ORDER_STATUS.PENDING_CONFIRM,
    lockMode: 'optimistic',
  },
  [ORDER_ACTION.USER_CONFIRM]: {
    from: ORDER_STATUS.PENDING_CONFIRM,
    to: ORDER_STATUS.COMPLETED,
    lockMode: 'optimistic',
  },
  [ORDER_ACTION.USER_CANCEL_UNPAID]: {
    from: ORDER_STATUS.PENDING_PAYMENT,
    to: ORDER_STATUS.CANCELLED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.USER_CANCEL_BOOKING]: {
    from: ORDER_STATUS.PENDING_DISPATCH,
    to: ORDER_STATUS.CANCELLED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.USER_CANCEL_PAID_REFUND]: {
    from: ORDER_STATUS.PENDING_DISPATCH,
    to: ORDER_STATUS.REFUND_PENDING,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.USER_REQUEST_REFUND]: {
    from: ORDER_STATUS.PENDING_DISPATCH,
    to: ORDER_STATUS.REFUND_PENDING,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.ADMIN_REFUND_APPROVE]: {
    from: ORDER_STATUS.REFUND_PENDING,
    to: ORDER_STATUS.REFUND_PENDING,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.ADMIN_REFUND_REJECT]: {
    from: ORDER_STATUS.REFUND_PENDING,
    to: ORDER_STATUS.AFTER_SALES,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.REFUND_PROCESSING]: {
    from: ORDER_STATUS.REFUND_PENDING,
    to: ORDER_STATUS.REFUND_PENDING,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.REFUND_SUCCESS]: {
    from: ORDER_STATUS.REFUND_PENDING,
    to: ORDER_STATUS.REFUNDED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.REFUND_FAIL]: {
    from: ORDER_STATUS.REFUND_PENDING,
    to: ORDER_STATUS.REFUND_PENDING,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.AFTER_SALES_REQUEST]: {
    from: [
      ORDER_STATUS.ACCEPTED,
      ORDER_STATUS.ON_THE_WAY,
      ORDER_STATUS.IN_SERVICE,
      ORDER_STATUS.PENDING_CONFIRM,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.AFTER_SALES,
    ],
    to: ORDER_STATUS.AFTER_SALES,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.AFTER_SALES_CLOSE]: {
    from: ORDER_STATUS.AFTER_SALES,
    to: ORDER_STATUS.COMPLETED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.TIMEOUT_UNPAID]: {
    from: ORDER_STATUS.PENDING_PAYMENT,
    to: ORDER_STATUS.CANCELLED,
    lockMode: 'pessimistic',
  },
  [ORDER_ACTION.AUTO_CONFIRM]: {
    from: ORDER_STATUS.PENDING_CONFIRM,
    to: ORDER_STATUS.COMPLETED,
    lockMode: 'optimistic',
  },
} satisfies Record<OrderAction, OrderTransitionRule>

export function getOrderTransition(action: OrderAction): OrderTransitionRule {
  return ORDER_TRANSITIONS[action]
}
