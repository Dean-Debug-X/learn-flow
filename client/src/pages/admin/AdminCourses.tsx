import { Fragment, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MediaField from "@/components/admin/MediaField";
import { confirmDangerousAction } from "@/lib/adminDanger";

interface CourseForm {
  title: string;
  slug: string;
  description: string;
  coverUrl: string;
  videoUrl: string;
  categoryId: string;
  duration: string;
  level: "beginner" | "intermediate" | "advanced";
  status: "draft" | "published";
  accessType: "free" | "login" | "vip" | "paid";
  trialChapterCount: string;
  priceCents: string;
  featured: boolean;
  featuredOrder: string;
  instructor: string;
  tags: string;
}

interface ChapterForm {
  title: string;
  description: string;
  videoUrl: string;
  duration: string;
  isFree: boolean;
}

const defaultForm: CourseForm = {
  title: "",
  slug: "",
  description: "",
  coverUrl: "",
  videoUrl: "",
  categoryId: "",
  duration: "",
  level: "beginner",
  status: "draft",
  accessType: "free",
  trialChapterCount: "1",
  priceCents: "0",
  featured: false,
  featuredOrder: "0",
  instructor: "",
  tags: "",
};

const defaultChapterForm: ChapterForm = {
  title: "",
  description: "",
  videoUrl: "",
  duration: "",
  isFree: false,
};

function slugify(str: string) {
  return (
    str
      .toLowerCase()
      .replace(/[\u4e00-\u9fa5]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `course-${Date.now()}`
  );
}

export default function AdminCourses() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<CourseForm>(defaultForm);
  const utils = trpc.useUtils();

  const { data: coursesData, isLoading } = trpc.course.list.useQuery({ status: "all", limit: 100 });
  const { data: categories } = trpc.category.list.useQuery();

  const createMutation = trpc.course.create.useMutation({
    onSuccess: () => {
      utils.course.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
      toast.success("课程创建成功");
    },
    onError: (error) => toast.error(`创建失败：${error.message}`),
  });

  const updateMutation = trpc.course.update.useMutation({
    onSuccess: () => {
      utils.course.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
      toast.success("课程已更新");
    },
    onError: (error) => toast.error(`更新失败：${error.message}`),
  });

  const deleteMutation = trpc.course.delete.useMutation({
    onSuccess: () => {
      utils.course.list.invalidate();
      setDeleteId(null);
      toast.success("课程已删除");
    },
    onError: (error) => toast.error(`删除失败：${error.message}`),
  });

  const courses = useMemo(
    () =>
      (coursesData?.items ?? []).filter((course) =>
        search ? [course.title, course.instructor ?? "", course.slug].some((text) => text.includes(search)) : true
      ),
    [coursesData?.items, search]
  );

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (course: (typeof courses)[number]) => {
    setEditId(course.id);
    setForm({
      title: course.title,
      slug: course.slug,
      description: course.description ?? "",
      coverUrl: course.coverUrl ?? "",
      videoUrl: course.videoUrl ?? "",
      categoryId: course.categoryId?.toString() ?? "",
      duration: course.duration?.toString() ?? "",
      level: (course.level as CourseForm["level"]) ?? "beginner",
      status: (course.status as CourseForm["status"]) ?? "draft",
      accessType: (course.accessType as CourseForm["accessType"]) ?? "free",
      trialChapterCount: course.trialChapterCount?.toString() ?? "1",
      priceCents: course.priceCents?.toString() ?? "0",
      featured: Boolean(course.featured),
      featuredOrder: course.featuredOrder?.toString() ?? "0",
      instructor: course.instructor ?? "",
      tags: course.tags ?? "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      title: form.title,
      slug: form.slug || slugify(form.title),
      description: form.description || undefined,
      coverUrl: form.coverUrl || undefined,
      videoUrl: form.videoUrl || undefined,
      categoryId: form.categoryId ? Number(form.categoryId) : undefined,
      duration: form.duration ? Number(form.duration) : undefined,
      level: form.level,
      status: form.status,
      accessType: form.accessType,
      trialChapterCount: form.trialChapterCount ? Number(form.trialChapterCount) : 0,
      priceCents: form.accessType === "paid" ? Number(form.priceCents || 0) : 0,
      featured: form.featured,
      featuredOrder: form.featured ? Number(form.featuredOrder || 0) : 0,
      instructor: form.instructor || undefined,
      tags: form.tags || undefined,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
      return;
    }
    createMutation.mutate(payload);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">课程管理</h1>
            <p className="text-sm text-muted-foreground mt-1">当前共 {coursesData?.total ?? 0} 门课程，已展示 {courses.length} 门。</p>
          </div>
          <Button className="gap-1.5" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            新建课程
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索课程标题、讲师或 slug" className="pl-9" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card py-16 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">暂无课程</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">课程</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">分类</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">讲师</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">状态</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <Fragment key={course.id}>
                    <tr className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
                            {course.coverUrl ? (
                              <img src={course.coverUrl} alt={course.title} className="w-full h-full object-cover" />
                            ) : (
                              <BookOpen className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground line-clamp-1">{course.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{course.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {course.category ? (
                          <span style={{ color: course.category.color ?? "#6366f1" }} className="text-xs font-medium">
                            {course.category.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">未分类</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">{course.instructor ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${course.status === "published" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
                            {course.status === "published" ? "已发布" : "草稿"}
                          </span>
                          <span className="text-xs px-2 py-1 rounded-full bg-secondary text-muted-foreground">
                            {course.accessType === "free"
                              ? "免费"
                              : course.accessType === "login"
                                ? "登录可看"
                                : course.accessType === "vip"
                                  ? "会员"
                                  : course.priceCents && course.priceCents > 0
                                    ? `单课 ¥${(course.priceCents / 100).toFixed(2)}`
                                    : "单课"}
                          </span>
                          {course.featured ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                              推荐#{course.featuredOrder ?? 0}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedId(expandedId === course.id ? null : course.id)}>
                            {expandedId === course.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(course)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(course.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === course.id ? (
                      <tr className="border-b border-border bg-secondary/10">
                        <td colSpan={5} className="px-4 py-4">
                          <ChapterManager courseId={course.id} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditId(null);
          setForm(defaultForm);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "编辑课程" : "新建课程"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">课程标题 *</label>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value, slug: slugify(event.target.value) }))} placeholder="输入课程标题" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Slug</label>
              <Input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} placeholder="course-slug" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">讲师</label>
              <Input value={form.instructor} onChange={(event) => setForm((prev) => ({ ...prev, instructor: event.target.value }))} placeholder="讲师姓名" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">课程描述</label>
              <Textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={4} className="resize-none" placeholder="简要介绍课程内容、目标人群和产出。" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">分类</label>
              <Select value={form.categoryId || undefined} onValueChange={(value) => setForm((prev) => ({ ...prev, categoryId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">时长（秒）</label>
              <Input type="number" value={form.duration} onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))} placeholder="3600" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">难度</label>
              <Select value={form.level} onValueChange={(value) => setForm((prev) => ({ ...prev, level: value as CourseForm["level"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">入门</SelectItem>
                  <SelectItem value="intermediate">进阶</SelectItem>
                  <SelectItem value="advanced">高级</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">状态</label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as CourseForm["status"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">草稿</SelectItem>
                  <SelectItem value="published">已发布</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">访问权限</label>
              <Select value={form.accessType} onValueChange={(value) => setForm((prev) => ({ ...prev, accessType: value as CourseForm["accessType"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">免费</SelectItem>
                  <SelectItem value="login">登录可看</SelectItem>
                  <SelectItem value="vip">会员可看</SelectItem>
                  <SelectItem value="paid">单课付费</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">试看章节数</label>
              <Input type="number" value={form.trialChapterCount} onChange={(event) => setForm((prev) => ({ ...prev, trialChapterCount: event.target.value }))} placeholder="1" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">课程价格（分）</label>
              <Input type="number" value={form.priceCents} onChange={(event) => setForm((prev) => ({ ...prev, priceCents: event.target.value }))} placeholder="19900" disabled={form.accessType !== "paid"} />
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={form.featured} onChange={(event) => setForm((prev) => ({ ...prev, featured: event.target.checked }))} />
                设为首页推荐课程
              </label>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">推荐排序（越小越靠前）</label>
                <Input type="number" value={form.featuredOrder} onChange={(event) => setForm((prev) => ({ ...prev, featuredOrder: event.target.value }))} placeholder="0" disabled={!form.featured} />
              </div>
            </div>
            <div className="md:col-span-2">
              <MediaField label="课程封面" mediaType="image" value={form.coverUrl} onChange={(value) => setForm((prev) => ({ ...prev, coverUrl: value }))} placeholder="封面图 URL，建议用上传方式" />
            </div>
            <div className="md:col-span-2">
              <MediaField label="课程主视频" mediaType="video" value={form.videoUrl} onChange={(value) => setForm((prev) => ({ ...prev, videoUrl: value }))} placeholder="课程主视频 URL，可为空" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">标签（逗号分隔）</label>
              <Input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="React,前端,JavaScript" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={!form.title || isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {editId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除课程？</AlertDialogTitle>
            <AlertDialogDescription>该课程及其关联章节将一起失效，这个操作不能撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => {
              if (!deleteId) return;
              const confirmText = confirmDangerousAction("course.delete");
              if (!confirmText) return;
              deleteMutation.mutate({ id: deleteId, confirmText });
            }}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}

function ChapterManager({ courseId }: { courseId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<ChapterForm>(defaultChapterForm);
  const utils = trpc.useUtils();
  const { data: chapters } = trpc.chapter.listByCourse.useQuery({ courseId });

  const createMutation = trpc.chapter.create.useMutation({
    onSuccess: () => {
      utils.chapter.listByCourse.invalidate({ courseId });
      setDialogOpen(false);
      setForm(defaultChapterForm);
      toast.success("章节已创建");
    },
    onError: (error) => toast.error(`创建失败：${error.message}`),
  });

  const updateMutation = trpc.chapter.update.useMutation({
    onSuccess: () => {
      utils.chapter.listByCourse.invalidate({ courseId });
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultChapterForm);
      toast.success("章节已更新");
    },
    onError: (error) => toast.error(`更新失败：${error.message}`),
  });

  const reorderMutation = trpc.chapter.reorder.useMutation({
    onSuccess: () => utils.chapter.listByCourse.invalidate({ courseId }),
    onError: (error) => toast.error(`排序失败：${error.message}`),
  });

  const deleteMutation = trpc.chapter.delete.useMutation({
    onSuccess: () => {
      utils.chapter.listByCourse.invalidate({ courseId });
      setDeleteId(null);
      toast.success("章节已删除");
    },
    onError: (error) => toast.error(`删除失败：${error.message}`),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(defaultChapterForm);
    setDialogOpen(true);
  };

  const openEdit = (chapter: NonNullable<typeof chapters>[number]) => {
    setEditId(chapter.id);
    setForm({
      title: chapter.title,
      description: chapter.description ?? "",
      videoUrl: chapter.videoUrl ?? "",
      duration: chapter.duration?.toString() ?? "",
      isFree: Boolean(chapter.isFree),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      title: form.title,
      description: form.description || undefined,
      videoUrl: form.videoUrl || undefined,
      duration: form.duration ? Number(form.duration) : undefined,
      isFree: form.isFree,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
      return;
    }

    createMutation.mutate({
      courseId,
      ...payload,
      sortOrder: (chapters?.length ?? 0) + 1,
    });
  };

  const moveChapter = (chapterId: number, direction: -1 | 1) => {
    const items = [...(chapters ?? [])];
    const index = items.findIndex((item) => item.id === chapterId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const temp = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = temp;
    reorderMutation.mutate({
      courseId,
      items: items.map((item, idx) => ({ id: item.id, sortOrder: idx + 1 })),
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">章节管理</p>
          <p className="text-xs text-muted-foreground mt-1">支持编辑、排序、替换视频和设置试看。</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openCreate}>
          <Plus className="w-3.5 h-3.5" />新增章节
        </Button>
      </div>
      {chapters && chapters.length > 0 ? (
        <div className="space-y-2">
          {chapters.map((chapter, index) => (
            <div key={chapter.id} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-foreground shrink-0">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground line-clamp-1">{chapter.title}</p>
                  {chapter.isFree ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">试看</span> : null}
                  {chapter.videoUrl ? <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground inline-flex items-center gap-1"><PlayCircle className="w-3 h-3" />已绑定视频</span> : null}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{chapter.description ?? "暂无章节描述"}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveChapter(chapter.id, -1)} disabled={index === 0 || reorderMutation.isPending}>
                  <ArrowUp className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveChapter(chapter.id, 1)} disabled={index === (chapters?.length ?? 0) - 1 || reorderMutation.isPending}>
                  <ArrowDown className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(chapter)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(chapter.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          这门课程还没有章节，先加一个。
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setEditId(null);
          setForm(defaultChapterForm);
        }
      }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "编辑章节" : "新增章节"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">章节标题 *</label>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="例如：第一章 环境准备" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">章节描述</label>
              <Textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} className="resize-none" placeholder="补充本章要解决的问题或产出。" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">时长（秒）</label>
              <Input type="number" value={form.duration} onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))} placeholder="600" />
            </div>
            <MediaField label="章节视频" mediaType="video" value={form.videoUrl} onChange={(value) => setForm((prev) => ({ ...prev, videoUrl: value }))} placeholder="章节视频 URL，可为空" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={form.isFree} onChange={(event) => setForm((prev) => ({ ...prev, isFree: event.target.checked }))} />
              允许作为试看章节
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={!form.title || isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {editId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除章节？</AlertDialogTitle>
            <AlertDialogDescription>删除后不可恢复，相关学习进度也可能受到影响。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => {
              if (!deleteId) return;
              const confirmText = confirmDangerousAction("chapter.delete");
              if (!confirmText) return;
              deleteMutation.mutate({ id: deleteId, confirmText });
            }}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
