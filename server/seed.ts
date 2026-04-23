import { drizzle } from "drizzle-orm/mysql2";
import { categories, courses, chapters } from "../drizzle/schema.js";

async function seed() {
  const db = drizzle(process.env.DATABASE_URL!);

  // Insert categories
  await db.insert(categories).values([
    { name: "前端开发", slug: "frontend", description: "HTML、CSS、JavaScript、React、Vue 等前端技术", color: "#6366f1", sortOrder: 1 },
    { name: "后端开发", slug: "backend", description: "Node.js、Python、Java、数据库等后端技术", color: "#0ea5e9", sortOrder: 2 },
    { name: "人工智能", slug: "ai", description: "机器学习、深度学习、大语言模型等 AI 技术", color: "#8b5cf6", sortOrder: 3 },
    { name: "设计", slug: "design", description: "UI/UX 设计、Figma、设计系统等", color: "#ec4899", sortOrder: 4 },
    { name: "数据科学", slug: "data-science", description: "数据分析、可视化、统计学等", color: "#f59e0b", sortOrder: 5 },
    { name: "DevOps", slug: "devops", description: "Docker、Kubernetes、CI/CD、云原生等", color: "#10b981", sortOrder: 6 },
  ]).onDuplicateKeyUpdate({ set: { sortOrder: 0 } });

  console.log("✅ Categories inserted");

  // Get category IDs
  const cats = await db.select().from(categories);
  const catMap: Record<string, number> = {};
  for (const c of cats) catMap[c.slug] = c.id;

  // Insert courses
  const coursesData = [
    {
      title: "React 19 完全指南：从入门到精通",
      slug: "react-19-complete-guide",
      description: "全面掌握 React 19 最新特性，包括 Server Components、并发渲染、Hooks 最佳实践，构建高性能现代 Web 应用。",
      coverUrl: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["frontend"],
      duration: 28800,
      level: "intermediate" as const,
      status: "published" as const,
      featured: true,
      rating: 4.9,
      ratingCount: 1243,
      instructor: "张明远",
      tags: '["React","JavaScript","前端"]',
    },
    {
      title: "TypeScript 高级编程实战",
      slug: "typescript-advanced",
      description: "深入 TypeScript 类型系统、泛型编程、装饰器模式，掌握企业级 TypeScript 开发技巧。",
      coverUrl: "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["frontend"],
      duration: 21600,
      level: "advanced" as const,
      status: "published" as const,
      featured: false,
      rating: 4.8,
      ratingCount: 876,
      instructor: "李晓雪",
      tags: '["TypeScript","JavaScript"]',
    },
    {
      title: "Node.js 微服务架构实践",
      slug: "nodejs-microservices",
      description: "使用 Node.js 构建可扩展的微服务架构，涵盖 gRPC、消息队列、服务发现、链路追踪等核心技术。",
      coverUrl: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["backend"],
      duration: 36000,
      level: "advanced" as const,
      status: "published" as const,
      featured: true,
      rating: 4.7,
      ratingCount: 654,
      instructor: "王建国",
      tags: '["Node.js","微服务","后端"]',
    },
    {
      title: "大语言模型应用开发实战",
      slug: "llm-application-development",
      description: "从零构建基于 GPT/Claude 的 AI 应用，掌握 Prompt Engineering、RAG、Agent 等核心技术，打造智能化产品。",
      coverUrl: "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["ai"],
      duration: 32400,
      level: "intermediate" as const,
      status: "published" as const,
      featured: true,
      rating: 4.9,
      ratingCount: 2156,
      instructor: "陈思远",
      tags: '["AI","LLM","GPT"]',
    },
    {
      title: "Figma 设计系统从零搭建",
      slug: "figma-design-system",
      description: "学习如何使用 Figma 构建完整的设计系统，包括组件库、设计令牌、自动布局，提升团队协作效率。",
      coverUrl: "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["design"],
      duration: 18000,
      level: "beginner" as const,
      status: "published" as const,
      featured: false,
      rating: 4.6,
      ratingCount: 432,
      instructor: "刘美华",
      tags: '["Figma","设计","UI"]',
    },
    {
      title: "Python 数据分析与可视化",
      slug: "python-data-analysis",
      description: "使用 Python、Pandas、NumPy、Matplotlib 进行数据清洗、分析和可视化，掌握数据科学核心工具链。",
      coverUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["data-science"],
      duration: 25200,
      level: "beginner" as const,
      status: "published" as const,
      featured: false,
      rating: 4.7,
      ratingCount: 987,
      instructor: "赵文博",
      tags: '["Python","数据分析","可视化"]',
    },
    {
      title: "Kubernetes 容器编排实战",
      slug: "kubernetes-in-action",
      description: "从 Docker 基础到 Kubernetes 集群管理，掌握容器化部署、服务网格、自动扩缩容等云原生核心技能。",
      coverUrl: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["devops"],
      duration: 30600,
      level: "advanced" as const,
      status: "published" as const,
      featured: false,
      rating: 4.8,
      ratingCount: 543,
      instructor: "孙志远",
      tags: '["Kubernetes","Docker","DevOps"]',
    },
    {
      title: "Vue 3 + Vite 现代前端开发",
      slug: "vue3-vite-modern",
      description: "深入 Vue 3 Composition API、Pinia 状态管理、Vue Router 4，配合 Vite 构建工具打造极速开发体验。",
      coverUrl: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["frontend"],
      duration: 23400,
      level: "intermediate" as const,
      status: "published" as const,
      featured: false,
      rating: 4.7,
      ratingCount: 765,
      instructor: "林晓峰",
      tags: '["Vue3","Vite","前端"]',
    },
    {
      title: "深度学习与神经网络基础",
      slug: "deep-learning-fundamentals",
      description: "系统学习神经网络原理、反向传播算法、CNN/RNN/Transformer 架构，使用 PyTorch 实现经典模型。",
      coverUrl: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["ai"],
      duration: 43200,
      level: "advanced" as const,
      status: "published" as const,
      featured: false,
      rating: 4.8,
      ratingCount: 1087,
      instructor: "周科技",
      tags: '["深度学习","PyTorch","AI"]',
    },
    {
      title: "UI/UX 设计思维与用户研究",
      slug: "ux-design-thinking",
      description: "掌握以用户为中心的设计方法论，学习用户访谈、可用性测试、信息架构设计，提升产品体验设计能力。",
      coverUrl: "https://images.unsplash.com/photo-1586717791821-3f44a563fa4c?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["design"],
      duration: 16200,
      level: "beginner" as const,
      status: "published" as const,
      featured: false,
      rating: 4.5,
      ratingCount: 321,
      instructor: "吴雅婷",
      tags: '["UX","设计思维","用户研究"]',
    },
    {
      title: "PostgreSQL 数据库性能优化",
      slug: "postgresql-performance",
      description: "深入 PostgreSQL 查询优化、索引策略、分区表、连接池配置，解决大规模数据库性能瓶颈问题。",
      coverUrl: "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["backend"],
      duration: 19800,
      level: "advanced" as const,
      status: "published" as const,
      featured: false,
      rating: 4.6,
      ratingCount: 298,
      instructor: "郑大伟",
      tags: '["PostgreSQL","数据库","后端"]',
    },
    {
      title: "CI/CD 流水线搭建与自动化",
      slug: "cicd-pipeline",
      description: "使用 GitHub Actions、Jenkins、ArgoCD 构建完整 CI/CD 流水线，实现代码自动测试、构建、部署全流程自动化。",
      coverUrl: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=800&q=80",
      videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
      categoryId: catMap["devops"],
      duration: 22500,
      level: "intermediate" as const,
      status: "published" as const,
      featured: false,
      rating: 4.7,
      ratingCount: 412,
      instructor: "徐志强",
      tags: '["CI/CD","DevOps","自动化"]',
    },
  ];

  await db.insert(courses).values(coursesData).onDuplicateKeyUpdate({ set: { viewCount: 0 } });

  console.log("✅ Courses inserted");

  // Get course IDs
  const allCourses = await db.select().from(courses);
  const courseMap: Record<string, number> = {};
  for (const c of allCourses) courseMap[c.slug] = c.id;

  // Insert chapters for first course
  const reactCourseId = courseMap["react-19-complete-guide"];
  const llmCourseId = courseMap["llm-application-development"];
  const k8sCourseId = courseMap["kubernetes-in-action"];

  if (reactCourseId) {
    await db.insert(chapters).values([
      { courseId: reactCourseId, title: "React 19 新特性概览", description: "了解 React 19 带来的重大变化和新特性", duration: 1800, sortOrder: 1, isFree: true },
      { courseId: reactCourseId, title: "Server Components 深度解析", description: "掌握 React Server Components 的工作原理和最佳实践", duration: 3600, sortOrder: 2, isFree: false },
      { courseId: reactCourseId, title: "并发渲染与 Suspense", description: "理解 React 并发模式，使用 Suspense 优化用户体验", duration: 2700, sortOrder: 3, isFree: false },
    ]).onDuplicateKeyUpdate({ set: { sortOrder: 0 } });
  }

  if (llmCourseId) {
    await db.insert(chapters).values([
      { courseId: llmCourseId, title: "大语言模型基础与原理", description: "了解 Transformer 架构和 LLM 的工作机制", duration: 2400, sortOrder: 1, isFree: true },
      { courseId: llmCourseId, title: "Prompt Engineering 实战", description: "掌握高效 Prompt 设计技巧，提升模型输出质量", duration: 3000, sortOrder: 2, isFree: false },
    ]).onDuplicateKeyUpdate({ set: { sortOrder: 0 } });
  }

  if (k8sCourseId) {
    await db.insert(chapters).values([
      { courseId: k8sCourseId, title: "Docker 容器基础", description: "从零开始学习 Docker 容器化技术", duration: 2100, sortOrder: 1, isFree: true },
      { courseId: k8sCourseId, title: "Kubernetes 核心概念", description: "掌握 Pod、Service、Deployment 等核心资源", duration: 3300, sortOrder: 2, isFree: false },
    ]).onDuplicateKeyUpdate({ set: { sortOrder: 0 } });
  }

  console.log("✅ Chapters inserted");
  console.log("🎉 Seed completed!");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
