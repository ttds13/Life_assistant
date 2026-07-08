import request from "@/utils/request";
import type { ImagePageResult, ImageRecord, ImageReference, QueryImagesParams, UpdateImagePayload } from "./types";

const ImageAPI = {
  list(params: QueryImagesParams) {
    return request<unknown, ImagePageResult>({
      url: "/api/admin/images",
      method: "get",
      params,
    });
  },

  detail(id: string | number) {
    return request<unknown, ImageRecord>({
      url: `/api/admin/images/${id}`,
      method: "get",
    });
  },

  references(id: string | number) {
    return request<unknown, { fileId: number; references: ImageReference[] }>({
      url: `/api/admin/images/${id}/references`,
      method: "get",
    });
  },

  update(id: string | number, data: UpdateImagePayload) {
    return request<unknown, ImageRecord>({
      url: `/api/admin/images/${id}`,
      method: "patch",
      data,
    });
  },

  delete(id: string | number) {
    return request<unknown, ImageRecord>({
      url: `/api/admin/images/${id}`,
      method: "delete",
    });
  },
};

export default ImageAPI;
export * from "./types";
