import { defineMock } from "./base";

type MenuType = "C" | "M" | "B";

interface LifeRoute {
  path: string;
  component?: string;
  redirect?: string;
  name: string;
  meta: {
    title: string;
    icon?: string;
    hidden?: boolean;
    keepAlive?: boolean;
    alwaysShow?: boolean;
    params?: Record<string, unknown> | null;
  };
  children?: LifeRoute[];
}

interface LifeMenu {
  id: string;
  parentId: string;
  name: string;
  type: MenuType;
  routeName?: string | null;
  routePath: string;
  component?: string | null;
  sort: number;
  visible: number;
  icon?: string;
  redirect?: string | null;
  perm?: string | null;
  scope?: number;
  alwaysShow?: number;
  keepAlive?: number;
  children?: LifeMenu[];
}

interface OptionNode {
  value: string;
  label: string;
  children?: OptionNode[];
}

const lifeRoutes: LifeRoute[] = [
  {
    path: "/users",
    component: "Layout",
    redirect: "/users/list",
    name: "LifeUsers",
    meta: { title: "用户管理", icon: "user", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "list",
        component: "life/resource/index",
        name: "LifeUserList",
        meta: {
          title: "用户列表",
          icon: "user",
          keepAlive: true,
          params: { module: "users" },
        },
      },
      {
        path: "addresses",
        component: "life/resource/index",
        name: "LifeAddressList",
        meta: {
          title: "地址管理",
          icon: "menu",
          keepAlive: true,
          params: { module: "addresses" },
        },
      },
    ],
  },
  {
    path: "/services",
    component: "Layout",
    redirect: "/services/categories",
    name: "LifeServices",
    meta: { title: "服务管理", icon: "project", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "categories",
        component: "life/resource/index",
        name: "LifeServiceCategories",
        meta: {
          title: "服务分类",
          icon: "cascader",
          keepAlive: true,
          params: { module: "serviceCategories" },
        },
      },
      {
        path: "items",
        component: "life/resource/index",
        name: "LifeServiceItems",
        meta: {
          title: "服务项目",
          icon: "project",
          keepAlive: true,
          params: { module: "services" },
        },
      },
    ],
  },
  {
    path: "/orders",
    component: "Layout",
    redirect: "/orders/list",
    name: "LifeOrders",
    meta: { title: "订单管理", icon: "table", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "list",
        component: "life/orders/index",
        name: "LifeOrderList",
        meta: { title: "订单列表", icon: "table", keepAlive: true, params: null },
      },
      {
        path: "dispatch",
        component: "life/orders/index",
        name: "LifeOrderDispatch",
        meta: {
          title: "待派单",
          icon: "todo",
          keepAlive: true,
          params: { status: "pending_dispatch" },
        },
      },
      {
        path: "fulfillment",
        component: "life/resource/index",
        name: "LifeOrderFulfillment",
        meta: {
          title: "履约记录",
          icon: "document",
          keepAlive: true,
          params: { module: "fulfillments" },
        },
      },
      {
        path: "detail/:id",
        component: "life/orders/detail",
        name: "LifeOrderDetail",
        meta: {
          title: "订单详情",
          icon: "document",
          hidden: true,
          activeMenu: "/orders/list",
        } as any,
      },
    ],
  },
  {
    path: "/staff",
    component: "Layout",
    redirect: "/staff/list",
    name: "LifeStaff",
    meta: { title: "师傅管理", icon: "client", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "list",
        component: "life/resource/index",
        name: "LifeStaffList",
        meta: {
          title: "师傅列表",
          icon: "client",
          keepAlive: true,
          params: { module: "staff" },
        },
      },
      {
        path: "audit",
        component: "life/audit/index",
        name: "LifeStaffAudit",
        meta: {
          title: "认证审核",
          icon: "todo",
          keepAlive: true,
          params: { type: "staff" },
        },
      },
      {
        path: "status",
        component: "life/resource/index",
        name: "LifeStaffStatus",
        meta: {
          title: "工作状态",
          icon: "monitor",
          keepAlive: true,
          params: { module: "staffStatus" },
        },
      },
    ],
  },
  {
    path: "/finance",
    component: "Layout",
    redirect: "/finance/payments",
    name: "LifeFinance",
    meta: { title: "财务管理", icon: "monitor", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "payments",
        component: "life/resource/index",
        name: "LifePayments",
        meta: {
          title: "支付记录",
          icon: "monitor",
          keepAlive: true,
          params: { module: "payments" },
        },
      },
      {
        path: "refunds",
        component: "life/audit/index",
        name: "LifeRefundAudit",
        meta: {
          title: "退款审核",
          icon: "todo",
          keepAlive: true,
          params: { type: "refund" },
        },
      },
      {
        path: "withdraws",
        component: "life/audit/index",
        name: "LifeWithdrawAudit",
        meta: {
          title: "提现审核",
          icon: "todo",
          keepAlive: true,
          params: { type: "withdraw" },
        },
      },
    ],
  },
  {
    path: "/after-sales",
    component: "Layout",
    redirect: "/after-sales/reviews",
    name: "LifeAfterSales",
    meta: {
      title: "评价与售后",
      icon: "message",
      alwaysShow: true,
      hidden: false,
      params: null,
    },
    children: [
      {
        path: "reviews",
        component: "life/resource/index",
        name: "LifeReviews",
        meta: {
          title: "用户评价",
          icon: "message",
          keepAlive: true,
          params: { module: "reviews" },
        },
      },
      {
        path: "tickets",
        component: "life/audit/index",
        name: "LifeTicketAudit",
        meta: {
          title: "售后工单",
          icon: "todo",
          keepAlive: true,
          params: { type: "ticket" },
        },
      },
    ],
  },
  {
    path: "/marketing",
    component: "Layout",
    redirect: "/marketing/coupons",
    name: "LifeMarketing",
    meta: { title: "营销管理", icon: "bell", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "coupons",
        component: "life/resource/index",
        name: "LifeCoupons",
        meta: {
          title: "优惠券",
          icon: "bell",
          keepAlive: true,
          params: { module: "coupons" },
        },
      },
      {
        path: "member-cards",
        component: "life/resource/index",
        name: "LifeMemberCards",
        meta: {
          title: "会员卡",
          icon: "file",
          keepAlive: true,
          params: { module: "memberCards" },
        },
      },
    ],
  },
  {
    path: "/audit",
    component: "Layout",
    redirect: "/audit/center",
    name: "LifeAudit",
    meta: { title: "审核中心", icon: "todo", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "center",
        component: "life/audit/index",
        name: "LifeAuditCenter",
        meta: { title: "待审核事项", icon: "todo", keepAlive: true, params: { type: "all" } },
      },
    ],
  },
  {
    path: "/system",
    component: "Layout",
    redirect: "/system/user",
    name: "LifeSystem",
    meta: { title: "系统管理", icon: "system", alwaysShow: true, hidden: false, params: null },
    children: [
      {
        path: "user",
        component: "system/user/index",
        name: "User",
        meta: { title: "管理员", icon: "user", keepAlive: true, params: null },
      },
      {
        path: "role",
        component: "system/role/index",
        name: "Role",
        meta: { title: "角色管理", icon: "role", keepAlive: true, params: null },
      },
      {
        path: "menu",
        component: "system/menu/index",
        name: "SysMenu",
        meta: { title: "菜单/权限", icon: "menu", keepAlive: true, params: null },
      },
      {
        path: "dict",
        component: "system/dict/index",
        name: "Dict",
        meta: { title: "字典管理", icon: "dict", keepAlive: true, params: null },
      },
      {
        path: "log",
        component: "system/log/index",
        name: "Log",
        meta: { title: "操作日志", icon: "document", keepAlive: true, params: null },
      },
      {
        path: "dict-item",
        component: "system/dict/dict-item",
        name: "DictItem",
        meta: { title: "字典项", hidden: true, keepAlive: true, params: null },
      },
      {
        path: "config",
        component: "system/config/index",
        name: "Config",
        meta: { title: "系统配置", icon: "setting", keepAlive: true, params: null },
      },
    ],
  },
];

const menuTree: LifeMenu[] = [
  catalog("10", "0", "用户管理", "/users", "Layout", "user", 10, "/users/list", [
    menu("101", "10", "用户列表", "LifeUserList", "list", "life/resource/index", "user", 1, {
      perm: "user:list",
    }),
    menu("102", "10", "地址管理", "LifeAddressList", "addresses", "life/resource/index", "menu", 2, {
      perm: "user:address:list",
    }),
  ]),
  catalog("20", "0", "服务管理", "/services", "Layout", "project", 20, "/services/categories", [
    menu(
      "201",
      "20",
      "服务分类",
      "LifeServiceCategories",
      "categories",
      "life/resource/index",
      "cascader",
      1,
      { perm: "service:category:list" }
    ),
    menu("202", "20", "服务项目", "LifeServiceItems", "items", "life/resource/index", "project", 2, {
      perm: "service:list",
    }),
  ]),
  catalog("30", "0", "订单管理", "/orders", "Layout", "table", 30, "/orders/list", [
    menu("301", "30", "订单列表", "LifeOrderList", "list", "life/orders/index", "table", 1, {
      perm: "order:list",
    }),
    menu("302", "30", "待派单", "LifeOrderDispatch", "dispatch", "life/orders/index", "todo", 2, {
      perm: "order:assign",
    }),
    menu(
      "303",
      "30",
      "履约记录",
      "LifeOrderFulfillment",
      "fulfillment",
      "life/resource/index",
      "document",
      3,
      { perm: "order:fulfillment:list" }
    ),
  ]),
  catalog("40", "0", "师傅管理", "/staff", "Layout", "client", 40, "/staff/list", [
    menu("401", "40", "师傅列表", "LifeStaffList", "list", "life/resource/index", "client", 1, {
      perm: "staff:list",
    }),
    menu("402", "40", "认证审核", "LifeStaffAudit", "audit", "life/audit/index", "todo", 2, {
      perm: "staff:audit",
    }),
    menu(
      "403",
      "40",
      "工作状态",
      "LifeStaffStatus",
      "status",
      "life/resource/index",
      "monitor",
      3,
      { perm: "staff:status:list" }
    ),
  ]),
  catalog("50", "0", "财务管理", "/finance", "Layout", "monitor", 50, "/finance/payments", [
    menu("501", "50", "支付记录", "LifePayments", "payments", "life/resource/index", "monitor", 1, {
      perm: "finance:payment:list",
    }),
    menu("502", "50", "退款审核", "LifeRefundAudit", "refunds", "life/audit/index", "todo", 2, {
      perm: "finance:refund:audit",
    }),
    menu("503", "50", "提现审核", "LifeWithdrawAudit", "withdraws", "life/audit/index", "todo", 3, {
      perm: "finance:withdraw:audit",
    }),
  ]),
  catalog(
    "60",
    "0",
    "评价与售后",
    "/after-sales",
    "Layout",
    "message",
    60,
    "/after-sales/reviews",
    [
      menu("601", "60", "用户评价", "LifeReviews", "reviews", "life/resource/index", "message", 1, {
        perm: "review:list",
      }),
      menu("602", "60", "售后工单", "LifeTicketAudit", "tickets", "life/audit/index", "todo", 2, {
        perm: "ticket:handle",
      }),
    ]
  ),
  catalog("70", "0", "营销管理", "/marketing", "Layout", "bell", 70, "/marketing/coupons", [
    menu("701", "70", "优惠券", "LifeCoupons", "coupons", "life/resource/index", "bell", 1, {
      perm: "marketing:coupon:list",
    }),
    menu(
      "702",
      "70",
      "会员卡",
      "LifeMemberCards",
      "member-cards",
      "life/resource/index",
      "file",
      2,
      { perm: "marketing:member-card:list" }
    ),
  ]),
  catalog("80", "0", "审核中心", "/audit", "Layout", "todo", 80, "/audit/center", [
    menu("801", "80", "待审核事项", "LifeAuditCenter", "center", "life/audit/index", "todo", 1, {
      perm: "audit:list",
    }),
  ]),
  catalog("90", "0", "系统管理", "/system", "Layout", "system", 90, "/system/user", [
    menu("901", "90", "管理员", "User", "user", "system/user/index", "user", 1, {
      perm: "sys:user:list",
    }),
    menu("902", "90", "角色管理", "Role", "role", "system/role/index", "role", 2, {
      perm: "sys:role:list",
    }),
    menu("903", "90", "菜单/权限", "SysMenu", "menu", "system/menu/index", "menu", 3, {
      perm: "sys:menu:list",
    }),
    menu("904", "90", "字典管理", "Dict", "dict", "system/dict/index", "dict", 4, {
      perm: "sys:dict:list",
    }),
    menu("905", "90", "操作日志", "Log", "log", "system/log/index", "document", 5, {
      perm: "sys:log:list",
    }),
    menu("906", "90", "系统配置", "Config", "config", "system/config/index", "setting", 6, {
      perm: "sys:config:list",
    }),
    menu("907", "90", "字典项", "DictItem", "dict-item", "system/dict/dict-item", "dict", 7, {
      visible: 0,
      perm: "sys:dict-item:list",
    }),
  ]),
];

const menuMap = flattenMenus(menuTree).reduce<Record<string, LifeMenu>>((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export default defineMock([
  {
    url: "menus/routes",
    method: ["GET"],
    body: {
      code: "00000",
      data: lifeRoutes,
      msg: "一切ok",
    },
  },
  {
    url: "menus",
    method: ["GET"],
    body({ query }) {
      const keywords = String(query?.keywords || "").trim();
      const data = keywords ? filterMenuTree(menuTree, keywords) : menuTree;
      return {
        code: "00000",
        data,
        msg: "一切ok",
      };
    },
  },
  {
    url: "menus/options",
    method: ["GET"],
    body: {
      code: "00000",
      data: [
        {
          value: "0",
          label: "顶级菜单",
          children: buildOptions(menuTree),
        },
      ],
      msg: "一切ok",
    },
  },
  {
    url: "menus",
    method: ["POST"],
    body({ body }) {
      return {
        code: "00000",
        data: null,
        msg: `新增菜单 ${body.name || ""} 成功`,
      };
    },
  },
  {
    url: "menus/:id/form",
    method: ["GET"],
    body: ({ params }) => {
      return {
        code: "00000",
        data:
          menuMap[params.id] ??
          ({
            id: params.id,
            parentId: "0",
            name: "",
            type: "M",
            routeName: "",
            routePath: "",
            component: "",
            icon: "",
            redirect: "",
            perm: null,
            visible: 1,
            scope: 2,
            sort: 1,
            alwaysShow: 0,
            keepAlive: 1,
            params: [],
          } satisfies LifeMenu & { params: unknown[] }),
        msg: "一切ok",
      };
    },
  },
  {
    url: "menus/:id",
    method: ["PUT"],
    body({ body }) {
      return {
        code: "00000",
        data: null,
        msg: `修改菜单 ${body.name || ""} 成功`,
      };
    },
  },
  {
    url: "menus/:id",
    method: ["DELETE"],
    body({ params }) {
      return {
        code: "00000",
        data: null,
        msg: `删除菜单 ${params.id} 成功`,
      };
    },
  },
]);

function catalog(
  id: string,
  parentId: string,
  name: string,
  routePath: string,
  component: string,
  icon: string,
  sort: number,
  redirect: string,
  children: LifeMenu[]
): LifeMenu {
  return {
    id,
    parentId,
    name,
    type: "C",
    routeName: null,
    routePath,
    component,
    sort,
    visible: 1,
    icon,
    redirect,
    perm: null,
    scope: 2,
    alwaysShow: 1,
    keepAlive: 0,
    children,
  };
}

function menu(
  id: string,
  parentId: string,
  name: string,
  routeName: string,
  routePath: string,
  component: string,
  icon: string,
  sort: number,
  options: Partial<LifeMenu> = {}
): LifeMenu {
  return {
    id,
    parentId,
    name,
    type: "M",
    routeName,
    routePath,
    component,
    sort,
    visible: options.visible ?? 1,
    icon,
    redirect: null,
    perm: options.perm ?? null,
    scope: 2,
    alwaysShow: 0,
    keepAlive: 1,
    children: options.children ?? [],
  };
}

function flattenMenus(items: LifeMenu[]): LifeMenu[] {
  return items.flatMap((item) => [item, ...flattenMenus(item.children || [])]);
}

function buildOptions(items: LifeMenu[]): OptionNode[] {
  return items
    .filter((item) => item.type !== "B")
    .map((item) => {
      const node: OptionNode = {
        value: item.id,
        label: item.name,
      };
      const children = buildOptions(item.children || []);
      if (children.length) node.children = children;
      return node;
    });
}

function filterMenuTree(items: LifeMenu[], keyword: string): LifeMenu[] {
  return items
    .map((item) => {
      const children = filterMenuTree(item.children || [], keyword);
      if (item.name.includes(keyword) || children.length) {
        return { ...item, children };
      }
      return null;
    })
    .filter(Boolean) as LifeMenu[];
}
