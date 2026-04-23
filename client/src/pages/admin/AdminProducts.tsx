import { useMemo, useState } from "react";
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDangerousAction } from "@/lib/adminDanger";
import AdminLayout from "./AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductForm {
  type: "course" | "vip";
  title: string;
  description: string;
  status: "draft" | "active" | "archived";
  courseId: string;
  priceCents: string;
  durationDays: string;
  coverUrl: string;
  sortOrder: string;
}

const defaultForm: ProductForm = {
  type: "course",
  title: "",
  description: "",
  status: "active",
  courseId: "",
  priceCents: "0",
  durationDays: "365",
  coverUrl: "",
  sortOrder: "0",
};

function formatPrice(priceCents?: number | null) {
  return `¥${((priceCents ?? 0) / 100).toFixed(2)}`;
}

export default function AdminProducts() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);

  const { data: products, isLoading } = trpc.product.list.useQuery({ activeOnly: false, status: "all" });
  const { data: courses } = trpc.course.list.useQuery({ status: "all", limit: 200 });

  const createMutation = trpc.product.create.useMutation({
    onSuccess: async () => {
      await utils.product.list.invalidate();
      setDialogOpen(false);
      setForm(defaultForm);
      toast.success("商品已创建");
    },
    onError: (error) => toast.error(`创建失败：${error.message}`),
  });

  const updateMutation = trpc.product.update.useMutation({
    onSuccess: async () => {
      await utils.product.list.invalidate();
      setDialogOpen(false);
      setEditId(null);
      setForm(defaultForm);
      toast.success("商品已更新");
    },
    onError: (error) => toast.error(`更新失败：${error.message}`),
  });

  const deleteMutation = trpc.product.delete.useMutation({
    onSuccess: async () => {
      await utils.product.list.invalidate();
      setDeleteId(null);
      toast.success("商品已删除");
    },
    onError: (error) => toast.error(`删除失败：${error.message}`),
  });

  const filtered = useMemo(() => {
    const q = search.trim();
    return (products ?? []).filter((item) =>
      q ? [item.title, item.description ?? "", item.course?.title ?? ""].some((text) => text.includes(q)) : true
    );
  }, [products, search]);

  const openCreate = () => {
    setEditId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (product: NonNullable<typeof products>[number]) => {
    setEditId(product.id);
    setForm({
      type: (product.type as ProductForm["type"]) ?? "course",
      title: product.title,
      description: product.description ?? "",
      status: (product.status as ProductForm["status"]) ?? "active",
      courseId: product.courseId?.toString() ?? "",
      priceCents: String(product.priceCents ?? 0),
      durationDays: product.durationDays?.toString() ?? "365",
      coverUrl: product.coverUrl ?? "",
      sortOrder: String(product.sortOrder ?? 0),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      type: form.type,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      status: form.status,
      courseId: form.type === "course" ? (form.courseId ? Number(form.courseId) : null) : null,
      priceCents: Number(form.priceCents || 0),
      durationDays: form.type === "vip" ? (form.durationDays ? Number(form.durationDays) : null) : null,
      coverUrl: form.coverUrl.trim() || undefined,
      sortOrder: Number(form.sortOrder || 0),
    };

    if (!payload.title) {
      toast.error("请输入商品标题");
      return;
    }
    if (payload.type === "course" && !payload.courseId) {
      toast.error("单课商品必须绑定课程");
      return;
    }

    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
      return;
    }
    createMutation.mutate(payload);
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">商品管理</h1>
            <p className="text-sm text-muted-foreground mt-1">管理 VIP 商品和单课商品，给订单与权益系统提供可售卖对象。</p>
          </div>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            新建商品
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索商品标题或关联课程" className="pl-9" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_0.9fr_120px] gap-3 px-4 py-3 border-b border-border text-xs font-medium text-muted-foreground">
            <div>商品</div>
            <div>类型</div>
            <div>关联对象</div>
            <div>价格</div>
            <div>状态</div>
            <div className="text-right">操作</div>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">还没有商品，先新建一个。</div>
          ) : (
            filtered.map((product) => (
              <div key={product.id} className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.7fr_0.9fr_120px] gap-3 px-4 py-4 border-b border-border last:border-0 items-center text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground line-clamp-1">{product.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.description || "暂无商品描述"}</p>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${product.type === "vip" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" : "bg-secondary text-muted-foreground"}`}>
                    {product.type === "vip" ? "VIP 会员" : "单课商品"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {product.type === "vip" ? `${product.durationDays ?? 0} 天` : product.course?.title ?? "未绑定课程"}
                </div>
                <div className="font-medium text-foreground">{formatPrice(product.priceCents)}</div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${product.status === "active" ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400" : product.status === "draft" ? "bg-secondary text-muted-foreground" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"}`}>
                    {product.status === "active" ? "上架中" : product.status === "draft" ? "草稿" : "已归档"}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(product)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteId(product.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editId ? "编辑商品" : "新建商品"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-2">商品类型</p>
                <Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value as ProductForm["type"], courseId: value === "vip" ? "" : prev.courseId }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="course">单课商品</SelectItem>
                    <SelectItem value="vip">VIP 商品</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">状态</p>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ProductForm["status"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="active">上架</SelectItem>
                    <SelectItem value="archived">归档</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">商品标题</p>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="例如：年度会员 / Unity 从入门到进阶" />
            </div>

            {form.type === "course" ? (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">关联课程</p>
                <Select value={form.courseId || undefined} onValueChange={(value) => setForm((prev) => ({ ...prev, courseId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择课程" />
                  </SelectTrigger>
                  <SelectContent>
                    {(courses?.items ?? []).map((course) => (
                      <SelectItem key={course.id} value={String(course.id)}>{course.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-2">价格（分）</p>
                <Input value={form.priceCents} onChange={(event) => setForm((prev) => ({ ...prev, priceCents: event.target.value }))} placeholder="9900" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-2">排序</p>
                <Input value={form.sortOrder} onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))} placeholder="0" />
              </div>
            </div>

            {form.type === "vip" ? (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">会员时长（天）</p>
                <Input value={form.durationDays} onChange={(event) => setForm((prev) => ({ ...prev, durationDays: event.target.value }))} placeholder="365" />
              </div>
            ) : null}

            <div>
              <p className="text-sm font-medium text-foreground mb-2">封面地址</p>
              <Input value={form.coverUrl} onChange={(event) => setForm((prev) => ({ ...prev, coverUrl: event.target.value }))} placeholder="https://..." />
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-2">商品描述</p>
              <Textarea rows={4} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="描述购买后会获得什么权益" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              {editId ? "保存修改" : "创建商品"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这个商品？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，新的下单入口会失效；历史订单记录仍然保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!deleteId) return;
              const confirmText = confirmDangerousAction("product.delete");
              if (!confirmText) return;
              deleteMutation.mutate({ id: deleteId, confirmText });
            }}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
