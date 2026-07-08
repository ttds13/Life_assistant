export interface QueryImagesDto {
  page?: string | number
  pageNum?: string | number
  pageSize?: string | number
  keyword?: string
  bizType?: string
  bizId?: string | number
  uploaderType?: string
  uploaderId?: string | number
  source?: string
  status?: string
  dateStart?: string
  dateEnd?: string
  onlyOrphaned?: string | boolean
}
