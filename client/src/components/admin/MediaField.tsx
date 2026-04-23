import { useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Link2, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { fileToDataUrl, getVideoDuration, uploadFileToSignedUrl } from "@/lib/file-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MediaFieldProps {
  label: string;
  mediaType: "image" | "video" | "file";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function MediaField({
  label,
  mediaType,
  value,
  onChange,
  placeholder,
}: MediaFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectValue, setSelectValue] = useState<string>("");
  const utils = trpc.useUtils();
  const { data: assets, isLoading } = trpc.media.list.useQuery({ type: mediaType });
  const prepareUploadMutation = trpc.media.prepareUpload.useMutation();
  const completeUploadMutation = trpc.media.completeUpload.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
  });
  const uploadMutation = trpc.media.upload.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
  });

  const currentAsset = useMemo(
    () => (assets ?? []).find((asset) => asset.url === value || asset.deliveryUrl === value),
    [assets, value]
  );

  const icon = mediaType === "image" ? ImagePlus : mediaType === "video" ? Video : Link2;
  const Icon = icon;
  const accessLevel = mediaType === "image" ? "public" : "protected";
  const isUploading =
    prepareUploadMutation.isPending || completeUploadMutation.isPending || uploadMutation.isPending;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const duration = mediaType === "video" ? await getVideoDuration(file) : undefined;
      const prepared = await prepareUploadMutation.mutateAsync({
        type: mediaType,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        duration,
        accessLevel,
      });

      let asset: any;
      if (prepared.mode === "direct") {
        await uploadFileToSignedUrl({
          file,
          uploadUrl: prepared.uploadUrl,
          method: prepared.method,
          headers: prepared.headers,
        });
        asset = await completeUploadMutation.mutateAsync({
          type: mediaType,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          duration,
          storageKey: prepared.key,
          url: prepared.objectUrl,
          accessLevel,
        });
      } else {
        const base64 = await fileToDataUrl(file);
        asset = await uploadMutation.mutateAsync({
          type: mediaType,
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          base64,
          duration,
          accessLevel,
        });
      }

      onChange(asset.deliveryUrl ?? asset.url);
      setSelectValue(String(asset.id));
      toast.success("媒体上传成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      event.target.value = "";
    }
  };

  const previewUrl = currentAsset?.deliveryUrl ?? value;

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground block">{label}</label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? "可手动填写 URL，或从下方上传/选择"}
        className="text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          上传{mediaType === "image" ? "图片" : mediaType === "video" ? "视频" : "文件"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}> 
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />清空
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={mediaType === "image" ? "image/*" : mediaType === "video" ? "video/*" : "*/*"}
        className="hidden"
        onChange={handleFileChange}
      />
      <Select
        value={selectValue}
        onValueChange={(next) => {
          setSelectValue(next);
          const asset = (assets ?? []).find((item) => item.id.toString() === next);
          if (asset) onChange(asset.deliveryUrl ?? asset.url);
        }}
      >
        <SelectTrigger className="text-sm">
          <SelectValue
            placeholder={isLoading ? "加载媒体中..." : `从已有${mediaType === "image" ? "图片" : mediaType === "video" ? "视频" : "文件"}中选择`}
          />
        </SelectTrigger>
        <SelectContent>
          {(assets ?? []).length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">暂无可选媒体</div>
          ) : (
            (assets ?? []).map((asset) => (
              <SelectItem key={asset.id} value={asset.id.toString()}>
                {asset.originName}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {value ? (
        <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2">
            <Icon className="w-3.5 h-3.5" />
            <span className="truncate">{currentAsset?.originName ?? value}</span>
          </div>
          {currentAsset ? (
            <div className="text-[11px] inline-flex items-center gap-1 rounded-full px-2 py-1 bg-background border border-border text-muted-foreground">
              {currentAsset.accessLevel === "protected" ? "受保护访问" : "公开访问"}
            </div>
          ) : null}
          {mediaType === "image" ? (
            <img src={previewUrl} alt={label} className="w-full max-h-40 object-cover rounded-lg border border-border" />
          ) : mediaType === "video" ? (
            <video src={previewUrl} controls className="w-full max-h-52 rounded-lg border border-border" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
