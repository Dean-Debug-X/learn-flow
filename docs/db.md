# 数据库说明

## 已有核心表

- `users`
- `categories`
- `courses`
- `chapters`
- `comments`

## P0 新增表

- `media_assets`：媒体中心资源表
- `user_course_progress`：用户课程级进度
- `user_chapter_progress`：用户章节级进度
- `user_learning_history`：学习轨迹记录

## 关键逻辑

### 1. 课程评分

评论创建或删除后，会自动回写：

- `courses.rating`
- `courses.ratingCount`

目前按顶级评论统计，不把回复评论计入评分。

### 2. 学习进度

- 视频播放过程中每隔一段时间自动保存位置
- 章节看完会标记 `completed`
- 课程总进度按章节累计观看秒数 / 总时长计算
- 最近学习记录写入 `user_learning_history`

### 3. 媒体资源

后台上传媒体后，媒体元数据会写入 `media_assets`，课程与章节仍然存 URL，便于现有页面兼容。

## 迁移文件

本次新增迁移：

- `drizzle/0002_p0_learning_and_media.sql`


## P2 前置新增表

- `site_settings`：站点级配置，当前用于首页首屏文案
- `homepage_banners`：首页 Banner 列表

## 课程权限字段

`courses` 表新增：

- `accessType`：`free / login / vip / paid`
- `trialChapterCount`：可直接试看章节数
- `priceCents`：单课价格（分）
- `featuredOrder`：推荐排序
- `publishedAt`：发布时间

## 迁移文件（新增）

- `drizzle/0003_p1_engagement_and_moderation.sql`
- `drizzle/0004_p2_permissions_and_homepage.sql`
