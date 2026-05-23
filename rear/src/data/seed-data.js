const now = new Date().toISOString()

function createSeedData() {
  const serviceCategories = [
    { id: 1, name: '日常保洁', icon: 'clean', sortOrder: 1, status: 1, createdAt: now, updatedAt: now },
    { id: 2, name: '深度保洁', icon: 'deep-clean', sortOrder: 2, status: 1, createdAt: now, updatedAt: now },
    { id: 3, name: '家电清洗', icon: 'appliance', sortOrder: 3, status: 1, createdAt: now, updatedAt: now },
    { id: 4, name: '水电维修', icon: 'repair', sortOrder: 4, status: 1, createdAt: now, updatedAt: now },
  ]

  const services = [
    {
      id: 1,
      categoryId: 1,
      name: '日常保洁 2 小时',
      description: '专业保洁人员上门，2 小时标准清洁',
      basePrice: 120,
      priceUnit: '次',
      coverImage: '',
      status: 1,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 2,
      categoryId: 2,
      name: '深度保洁 4 小时',
      description: '厨房、卫生间、客厅重点区域深度清洁',
      basePrice: 260,
      priceUnit: '次',
      coverImage: '',
      status: 1,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 3,
      categoryId: 3,
      name: '空调清洗',
      description: '挂机空调滤网、蒸发器和外壳清洁',
      basePrice: 99,
      priceUnit: '台',
      coverImage: '',
      status: 1,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 4,
      categoryId: 3,
      name: '油烟机清洗',
      description: '油烟机外壳、滤网和油杯清洗',
      basePrice: 159,
      priceUnit: '台',
      coverImage: '',
      status: 1,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 5,
      categoryId: 4,
      name: '水龙头维修',
      description: '水龙头漏水、松动和更换基础维修',
      basePrice: 80,
      priceUnit: '次',
      coverImage: '',
      status: 1,
      sortOrder: 5,
      createdAt: now,
      updatedAt: now,
    },
  ]

  return {
    meta: {
      version: 2,
      seededAt: now,
    },
    serviceCategories,
    services,
    users: [],
    userOauth: [],
  }
}

module.exports = { createSeedData }
