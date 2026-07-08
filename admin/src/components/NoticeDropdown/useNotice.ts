/**
 * 通知中心逻辑
 */
import { ref, onMounted, onBeforeUnmount } from "vue";
import LifeAPI from "@/api/life";
import type { AdminNotificationItem } from "@/api/life";
import type { NoticeItem, NoticeDetail } from "@/api/system/notice";
import { useSse } from "@/composables";
import router from "@/router";

const PAGE_SIZE = 5;

const NOTICE_EVENT = "notice";

export function useNotice() {
  const { on } = useSse();

  // 状态
  const list = ref<NoticeItem[]>([]);
  const unreadTotal = ref(0);
  const detail = ref<NoticeDetail | null>(null);
  const dialogVisible = ref(false);
  const adminNoticeMap = ref(new Map<string, AdminNotificationItem>());

  let unsubscribe: (() => void) | null = null;

  // ============================================
  // 数据获取
  // ============================================

  async function fetchList() {
    const [page, unread] = await Promise.all([
      LifeAPI.getAdminNotifications({ page: 1, pageSize: PAGE_SIZE, isRead: false }),
      LifeAPI.getAdminNotificationUnreadCount(),
    ]);
    adminNoticeMap.value = new Map((page.items || []).map((item) => [String(item.id), item]));
    list.value = (page.items || []).map(toNoticeItem);
    unreadTotal.value = unread.unreadCount ?? unread.count ?? list.value.length;
  }

  async function read(id: string) {
    const current = adminNoticeMap.value.get(String(id));
    if (current) {
      detail.value = toNoticeDetail(current);
      await LifeAPI.markAdminNotificationRead(id);
    }
    dialogVisible.value = true;

    const idx = list.value.findIndex((item: NoticeItem) => item.id === id);
    if (idx >= 0) list.value.splice(idx, 1);
    if (unreadTotal.value > 0) unreadTotal.value -= 1;

    await fetchList();
  }

  async function readAll() {
    const page = await LifeAPI.getAdminNotifications({ page: 1, pageSize: 100, isRead: false });
    await Promise.all((page.items || []).map((item) => LifeAPI.markAdminNotificationRead(item.id)));
    list.value = [];
    unreadTotal.value = 0;
    ElMessage.success("已全部标记为已读");
  }

  function goMore() {
    router.push({ name: "LifeOrderDispatch" });
  }

  function toNoticeItem(item: AdminNotificationItem): NoticeItem {
    return {
      id: String(item.id),
      title: item.title,
      content: item.content,
      type: 1,
      level: item.type,
      publishStatus: 1,
      isRead: item.isRead ? 1 : 0,
      publishTime: item.createdAt as unknown as Date,
    };
  }

  function toNoticeDetail(item: AdminNotificationItem): NoticeDetail {
    return {
      id: String(item.id),
      title: item.title,
      content: item.content,
      type: 1,
      level: item.type,
      publishStatus: 1,
      publisherName: "Life Assistant",
      publishTime: item.createdAt as unknown as Date,
    };
  }

  // ============================================
  // SSE 订阅
  // ============================================

  function setupSubscription() {
    if (unsubscribe) return;

    unsubscribe = on(NOTICE_EVENT, (data: any) => {
      try {
        if (!data.id) return;

        if (list.value.some((item: NoticeItem) => item.id === data.id)) return;

        unreadTotal.value += 1;

        list.value.unshift({
          id: data.id,
          title: data.title,
          type: data.type,
          publishTime: data.publishTime,
        } as NoticeItem);

        if (list.value.length > PAGE_SIZE) {
          list.value.length = PAGE_SIZE;
        }

        ElNotification({
          title: "您收到一条新的通知消息！",
          message: data.title,
          type: "success",
          position: "bottom-right",
        });
      } catch (e) {
        console.error("解析通知消息失败", e);
      }
    });

    on("notice-revoke", (data: any) => {
      try {
        if (!data.id) return;

        const idx = list.value.findIndex((item: NoticeItem) => item.id === data.id);
        if (idx >= 0) {
          list.value.splice(idx, 1);
          if (unreadTotal.value > 0) unreadTotal.value -= 1;
        }
      } catch (e) {
        console.error("处理撤回通知失败", e);
      }
    });
  }

  // ============================================
  // 生命周期
  // ============================================

  onMounted(() => {
    fetchList();
    setupSubscription();
  });

  onBeforeUnmount(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  return {
    list,
    unreadTotal,
    detail,
    dialogVisible,
    fetchList,
    read,
    readAll,
    goMore,
  };
}
