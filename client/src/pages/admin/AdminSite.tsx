import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, LayoutTemplate, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDangerousAction } from "@/lib/adminDanger";
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
import MediaField from "@/components/admin/MediaField";

const defaultHomepage = {
  heroBadge: "AI 驱动的学习平台",
  heroTitle: "优雅学习，持续成长",
  heroSubtitle: "把课程内容、学习路径和站点运营配置都收进一个后台里。",
  primaryButtonText: "浏览课程",
  secondaryButtonText: "AI 智能搜索",
  featuredTitle: "优先看看这些精选课程",
  featuredSubtitle: "后台标记为推荐且已发布的课程会优先展示在这里。",
};

const defaultBanner = {
  title: "",
  subtitle: "",
  imageUrl: "",
  ctaText: "",
  ctaLink: "",
  isActive: true,
  sortOrder: "0",
};

export default function AdminSite() {
  const utils = trpc.useUtils();
  const { data: homepage } = trpc.site.homepage.useQuery();
  const { data: banners, isLoading } = trpc.site.bannerList.useQuery({ activeOnly: false });
  const [configForm, setConfigForm] = useState(defaultHomepage);
  const [configInitialized, setConfigInitialized] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [bannerForm, setBannerForm] = useState(defaultBanner);

  useEffect(() => {
    if (!homepage || configInitialized) return;
    setConfigForm({ ...defaultHomepage, ...homepage });
    setConfigInitialized(true);
  }, [homepage, configInitialized]);

  const saveHomepageMutation = trpc.site.updateHomepage.useMutation({
    onSuccess: () => {
      utils.site.homepage.invalidate();
      toast.success("首页配置已保存");
    },
    onError: (error) => toast.error(`保存失败：${error.message}`),
  });

  const createBannerMutation = trpc.site.createBanner.useMutation({
    onSuccess: () => {
      utils.site.bannerList.invalidate();
      setBannerDialogOpen(false);
      setEditId(null);
      setBannerForm(defaultBanner);
      toast.success("Banner 已创建");
    },
    onError: (error) => toast.error(`创建失败：${error.message}`),
  });

  const updateBannerMutation = trpc.site.updateBanner.useMutation({
    onSuccess: () => {
      utils.site.bannerList.invalidate();
      setBannerDialogOpen(false);
      setEditId(null);
      setBannerForm(defaultBanner);
      toast.success("Banner 已更新");
    },
    onError: (error) => toast.error(`更新失败：${error.message}`),
  });

  const deleteBannerMutation = trpc.site.deleteBanner.useMutation({
    onSuccess: () => {
      utils.site.bannerList.invalidate();
      setDeleteId(null);
      toast.success("Banner 已删除");
    },
    onError: (error) => toast.error(`删除失败：${error.message}`),
  });

  const reorderMutation = trpc.site.reorderBanners.useMutation({
    onSuccess: () => utils.site.bannerList.invalidate(),
    onError: (error) => toast.error(`排序失败：${error.message}`),
  });

  const orderedBanners = useMemo(() => banners ?? [], [banners]);

  const openCreate = () => {
    setEditId(null);
    setBannerForm(defaultBanner);
    setBannerDialogOpen(true);
  };

  const openEdit = (banner: NonNullable<typeof banners>[number]) => {
    setEditId(banner.id);
    setBannerForm({
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      imageUrl: banner.imageUrl ?? "",
      ctaText: banner.ctaText ?? "",
      ctaLink: banner.ctaLink ?? "",
      isActive: Boolean(banner.isActive),
      sortOrder: String(banner.sortOrder ?? 0),
    });
    setBannerDialogOpen(true);
  };

  const saveBanner = () => {
    const payload = {
      title: bannerForm.title,
      subtitle: bannerForm.subtitle || undefined,
      imageUrl: bannerForm.imageUrl || undefined,
      ctaText: bannerForm.ctaText || undefined,
      ctaLink: bannerForm.ctaLink || undefined,
      isActive: bannerForm.isActive,
      sortOrder: Number(bannerForm.sortOrder || 0),
    };

    if (editId) {
      updateBannerMutation.mutate({ id: editId, ...payload });
      return;
    }
    createBannerMutation.mutate(payload);
  };

  const moveBanner = (bannerId: number, direction: -1 | 1) => {
    const items = [...orderedBanners];
    const index = items.findIndex((item) => item.id === bannerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return;
    const temp = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = temp;
    reorderMutation.mutate({
      items: items.map((item, idx) => ({ id: item.id, sortOrder: idx })),
    });
  };

  const bannerPending = createBannerMutation.isPending || updateBannerMutation.isPending;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">运营配置</h1>
          <p className="text-sm text-muted-foreground mt-1">在这里配置首页首屏文案、推荐区说明和运营 Banner。</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">首页首屏配置</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Hero Badge</label>
              <Input value={configForm.heroBadge} onChange={(e) => setConfigForm((prev) => ({ ...prev, heroBadge: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">主按钮文案</label>
              <Input value={configForm.primaryButtonText} onChange={(e) => setConfigForm((prev) => ({ ...prev, primaryButtonText: e.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Hero 标题</label>
              <Input value={configForm.heroTitle} onChange={(e) => setConfigForm((prev) => ({ ...prev, heroTitle: e.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">Hero 副标题</label>
              <Textarea rows={3} className="resize-none" value={configForm.heroSubtitle} onChange={(e) => setConfigForm((prev) => ({ ...prev, heroSubtitle: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">AI 按钮文案</label>
              <Input value={configForm.secondaryButtonText} onChange={(e) => setConfigForm((prev) => ({ ...prev, secondaryButtonText: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">推荐区标题</label>
              <Input value={configForm.featuredTitle} onChange={(e) => setConfigForm((prev) => ({ ...prev, featuredTitle: e.target.value }))} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">推荐区说明</label>
              <Textarea rows={3} className="resize-none" value={configForm.featuredSubtitle} onChange={(e) => setConfigForm((prev) => ({ ...prev, featuredSubtitle: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveHomepageMutation.mutate(configForm)} disabled={saveHomepageMutation.isPending}>
              {saveHomepageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              保存首页配置
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-muted-foreground" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">首页 Banner</h2>
                <p className="text-xs text-muted-foreground mt-1">支持上传图片、设置 CTA 链接和启用状态。</p>
              </div>
            </div>
            <Button className="gap-1.5" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              新增 Banner
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : orderedBanners.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              还没有 Banner，先创建一个。
            </div>
          ) : (
            <div className="space-y-3">
              {orderedBanners.map((banner, index) => (
                <div key={banner.id} className="rounded-xl border border-border p-4 flex gap-4 items-start">
                  <div className="w-28 h-20 rounded-xl overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
                    {banner.imageUrl ? (
                      <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                    ) : (
                      <LayoutTemplate className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{banner.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${banner.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-secondary text-muted-foreground"}`}>
                        {banner.isActive ? "已启用" : "已停用"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">排序 {banner.sortOrder ?? index}</span>
                    </div>
                    {banner.subtitle ? <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{banner.subtitle}</p> : null}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      {banner.ctaText ? <span>按钮：{banner.ctaText}</span> : null}
                      {banner.ctaLink ? <span className="truncate max-w-[300px]">链接：{banner.ctaLink}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveBanner(banner.id, -1)} disabled={index === 0 || reorderMutation.isPending}>
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveBanner(banner.id, 1)} disabled={index === orderedBanners.length - 1 || reorderMutation.isPending}>
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(banner)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(banner.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={bannerDialogOpen} onOpenChange={(open) => {
        setBannerDialogOpen(open);
        if (!open) {
          setEditId(null);
          setBannerForm(defaultBanner);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "编辑 Banner" : "新增 Banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">标题 *</label>
              <Input value={bannerForm.title} onChange={(e) => setBannerForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">副标题</label>
              <Textarea rows={3} className="resize-none" value={bannerForm.subtitle} onChange={(e) => setBannerForm((prev) => ({ ...prev, subtitle: e.target.value }))} />
            </div>
            <MediaField label="Banner 图片" mediaType="image" value={bannerForm.imageUrl} onChange={(value) => setBannerForm((prev) => ({ ...prev, imageUrl: value }))} placeholder="建议使用宽屏横图" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">按钮文案</label>
                <Input value={bannerForm.ctaText} onChange={(e) => setBannerForm((prev) => ({ ...prev, ctaText: e.target.value }))} placeholder="立即查看" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">按钮链接</label>
                <Input value={bannerForm.ctaLink} onChange={(e) => setBannerForm((prev) => ({ ...prev, ctaLink: e.target.value }))} placeholder="/course/react-from-zero" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">排序</label>
                <Input type="number" value={bannerForm.sortOrder} onChange={(e) => setBannerForm((prev) => ({ ...prev, sortOrder: e.target.value }))} />
              </div>
              <div className="flex items-center pt-7">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={bannerForm.isActive} onChange={(e) => setBannerForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
                  立即启用
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBannerDialogOpen(false)}>取消</Button>
            <Button onClick={saveBanner} disabled={!bannerForm.title || bannerPending}>
              {bannerPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {editId ? "保存" : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 Banner？</AlertDialogTitle>
            <AlertDialogDescription>删除后首页将不再展示这条运营内容。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => {
              if (!deleteId) return;
              const confirmText = confirmDangerousAction("site.banner.delete");
              if (!confirmText) return;
              deleteBannerMutation.mutate({ id: deleteId, confirmText });
            }}>
              {deleteBannerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
