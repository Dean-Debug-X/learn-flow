import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type MutableRefObject,
  type VideoHTMLAttributes,
} from "react";
import { Loader2, ShieldCheck, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

const MEDIA_ID_PATTERN = /\/api\/media\/(\d+)\/content(?:\?.*)?$/;

function extractMediaId(sourceUrl?: string | null) {
  if (!sourceUrl) return null;
  const match = sourceUrl.match(MEDIA_ID_PATTERN);
  return match ? Number(match[1]) : null;
}

function canPlayNativeHls() {
  if (typeof document === "undefined") return false;
  const video = document.createElement("video");
  return Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
}

type SecureVideoPlayerProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "poster"> & {
  sourceUrl?: string | null;
  posterUrl?: string | null;
};

const statusLabels: Record<string, string> = {
  none: "原始视频",
  queued: "已排队转码",
  processing: "正在转码",
  ready: "HLS 已就绪",
  failed: "转码失败",
};

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T | null>).current = value;
}

const SecureVideoPlayer = forwardRef<HTMLVideoElement, SecureVideoPlayerProps>(function SecureVideoPlayer(
  { sourceUrl, posterUrl, className, ...videoProps },
  ref
) {
  const mediaId = useMemo(() => extractMediaId(sourceUrl), [sourceUrl]);
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(sourceUrl ?? undefined);
  const [fallbackUrl, setFallbackUrl] = useState<string | undefined>(undefined);
  const [resolvedPoster, setResolvedPoster] = useState<string | undefined>(posterUrl ?? undefined);
  const [statusText, setStatusText] = useState("");
  const [engineText, setEngineText] = useState("");
  const [loading, setLoading] = useState(false);
  const createTicketMutation = trpc.playback.createTicket.useMutation();

  useEffect(() => {
    assignRef(ref, innerRef.current);
  }, [ref]);

  useEffect(() => {
    let cancelled = false;

    async function resolvePlayback() {
      setResolvedPoster(posterUrl ?? undefined);
      setFallbackUrl(undefined);
      setEngineText("");

      if (!mediaId) {
        setResolvedUrl(sourceUrl ?? undefined);
        setStatusText("");
        return;
      }

      setLoading(true);
      try {
        const ticket = await createTicketMutation.mutateAsync({ mediaId, preferHls: true });
        if (cancelled) return;
        const useManifest = ticket.playbackType === "hls" && Boolean(ticket.manifestUrl);
        setResolvedUrl(useManifest ? ticket.manifestUrl ?? undefined : ticket.contentUrl ?? undefined);
        setFallbackUrl(ticket.contentUrl ?? undefined);
        setResolvedPoster(ticket.posterUrl ?? posterUrl ?? undefined);
        setStatusText(statusLabels[ticket.transcodeStatus] ?? "已签发播放票据");
      } catch {
        if (cancelled) return;
        setResolvedUrl(sourceUrl ?? undefined);
        setFallbackUrl(undefined);
        setResolvedPoster(posterUrl ?? undefined);
        setStatusText("已回退到直链播放");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolvePlayback();
    return () => {
      cancelled = true;
    };
  }, [createTicketMutation, mediaId, posterUrl, sourceUrl]);

  useEffect(() => {
    if (!resolvedUrl) return;

    let destroyed = false;
    let hlsInstance: { destroy: () => void } | null = null;
    const playbackUrl = resolvedUrl;
    const isManifest = /\.m3u8(?:\?|$)/i.test(playbackUrl);

    async function attachPlayback() {
      const currentVideo = innerRef.current;
      if (!currentVideo) return;

      if (isManifest && canPlayNativeHls()) {
        currentVideo.src = playbackUrl;
        setEngineText("原生 HLS");
        return;
      }

      if (isManifest) {
        try {
          const module = await import("hls.js");
          if (destroyed) return;
          const Hls = module.default;
          if (Hls?.isSupported?.()) {
            const instance = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hlsInstance = instance;
            instance.loadSource(playbackUrl);
            instance.attachMedia(currentVideo);
            setEngineText("Hls.js");
            instance.on(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean } | undefined) => {
              if (!data?.fatal) return;
              try {
                instance.destroy();
              } catch {
                // ignore cleanup errors
              }
              const fallbackVideo = innerRef.current;
              if (!fallbackVideo || !fallbackUrl) return;
              fallbackVideo.src = fallbackUrl;
              setEngineText("HLS 回退到直链");
              setStatusText("HLS 播放异常，已回退到直链视频");
            });
            return;
          }
        } catch {
          // fall back to direct playback below
        }
      }

      const directUrl = fallbackUrl ?? playbackUrl;
      if (!directUrl) return;
      currentVideo.src = directUrl;
      setEngineText(isManifest ? "HLS 回退到直链" : "直链视频");
    }

    attachPlayback();

    return () => {
      destroyed = true;
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [fallbackUrl, resolvedUrl]);

  if (!resolvedUrl) return null;

  return (
    <div className="relative h-full w-full">
      <video
        ref={(node) => {
          innerRef.current = node;
          assignRef(ref, node);
        }}
        poster={resolvedPoster}
        className={className}
        {...videoProps}
      />
      {(loading || statusText || engineText) && (
        <div className="absolute left-3 top-3 inline-flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white backdrop-blur-sm">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          <span>{loading ? "正在签发播放票据" : [statusText, engineText].filter(Boolean).join(" · ")}</span>
          {!loading &&
          (statusText.includes("HLS") || engineText.includes("HLS") || engineText.includes("Hls.js")) ? (
            <Zap className="h-3.5 w-3.5" />
          ) : null}
        </div>
      )}
    </div>
  );
});

export default SecureVideoPlayer;
