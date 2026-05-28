import os

icons_dir = os.path.dirname(os.path.abspath(__file__))

# 图标1：蓝色渐变底白字 - 经典商务风
icon1 = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1677FF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0958D9;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="180" ry="180" fill="url(#bg1)"/>
  <text x="512" y="520" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="380" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">吉喆</text>
  <rect x="312" y="720" width="400" height="6" rx="3" fill="rgba(255,255,255,0.4)"/>
</svg>'''

# 图标2：白底蓝字 - 简洁清爽
icon2 = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="180" ry="180" fill="#FFFFFF"/>
  <rect x="8" y="8" width="1008" height="1008" rx="176" ry="176" fill="none" stroke="#1677FF" stroke-width="6"/>
  <text x="512" y="520" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="380" font-weight="700" fill="#1677FF" text-anchor="middle" dominant-baseline="middle">吉喆</text>
  <rect x="312" y="720" width="400" height="6" rx="3" fill="#1677FF" opacity="0.3"/>
</svg>'''

# 图标3：蓝底带房屋图形 - 生活服务主题
icon3 = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg3" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#2B8AFF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1667E6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="180" ry="180" fill="url(#bg3)"/>
  <!-- 房屋轮廓装饰 -->
  <path d="M512 180 L720 340 L720 500 L304 500 L304 340 Z" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8" stroke-linejoin="round"/>
  <rect x="420" y="380" width="80" height="120" rx="4" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6"/>
  <rect x="540" y="380" width="80" height="120" rx="4" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6"/>
  <!-- 品牌名 -->
  <text x="512" y="680" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="320" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">吉喆</text>
  <!-- 底部标语 -->
  <text x="512" y="850" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="72" font-weight="400" fill="rgba(255,255,255,0.6)" text-anchor="middle" dominant-baseline="middle">生活服务</text>
</svg>'''

# 图标4：深蓝圆形徽章风格
icon4 = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="180" ry="180" fill="#F0F7FF"/>
  <!-- 圆形徽章 -->
  <circle cx="512" cy="480" r="320" fill="#1677FF"/>
  <circle cx="512" cy="480" r="290" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="4"/>
  <!-- 品牌名 -->
  <text x="512" y="500" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="280" font-weight="700" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">吉喆</text>
  <!-- 底部文字 -->
  <text x="512" y="890" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="80" font-weight="500" fill="#1677FF" text-anchor="middle" dominant-baseline="middle">JIZHE</text>
</svg>'''

# 图标5：现代极简 - 大字并排，色块点缀
icon5 = '''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg5" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1677FF;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#4096FF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1677FF;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" ry="220" fill="url(#bg5)"/>
  <!-- 装饰圆点 -->
  <circle cx="200" cy="200" r="60" fill="rgba(255,255,255,0.1)"/>
  <circle cx="824" cy="200" r="40" fill="rgba(255,255,255,0.08)"/>
  <circle cx="180" cy="824" r="45" fill="rgba(255,255,255,0.08)"/>
  <circle cx="844" cy="824" r="70" fill="rgba(255,255,255,0.1)"/>
  <!-- 品牌名 - 并排大字 -->
  <text x="420" y="512" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="400" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">吉</text>
  <text x="620" y="512" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="400" font-weight="800" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">喆</text>
</svg>'''

files = {
    'icon-1-blue-gradient.svg': icon1,
    'icon-2-white-clean.svg': icon2,
    'icon-3-home-service.svg': icon3,
    'icon-4-badge-circle.svg': icon4,
    'icon-5-modern-minimal.svg': icon5,
}

for name, content in files.items():
    path = os.path.join(icons_dir, name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Created: {name}')

print('Done! All 5 icons created.')
