import { useState } from "react";
import { Search, X, Sparkles, BookOpen, Clock, Star, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Streamdown } from "streamdown";
import { useComposition } from "@/hooks/useComposition";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AISearchDialogProps {
  open: boolean;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AISearchDialog({ open, onClose }: AISearchDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [mode, setMode] = useState<"search" | "chat">("search");

  const chatMutation = trpc.ai.chat.useMutation();
  const searchMutation = trpc.ai.searchCourses.useMutation();

  const composition = useComposition<HTMLTextAreaElement>();

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    setIsLoading(true);

    if (mode === "search") {
      // Search mode
      const userMsg: Message = { role: "user", content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const results = await searchMutation.mutateAsync({ query: trimmed });
        setSearchResults(results);
        const assistantMsg: Message = {
          role: "assistant",
          content:
            results.length > 0
              ? `根据你的搜索"${trimmed}"，我找到了 ${results.length} 门相关课程：`
              : `抱歉，没有找到与"${trimmed}"相关的课程，请尝试其他关键词。`,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "搜索出错，请稍后重试。" },
        ]);
      }
    } else {
      // Chat mode
      const newMessages: Message[] = [...messages, { role: "user", content: trimmed }];
      setMessages(newMessages);
      setSearchResults([]);
      try {
        const result = await chatMutation.mutateAsync({ messages: newMessages });
        setMessages((prev) => [...prev, { role: "assistant", content: result.content }]);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "回答出错，请稍后重试。" },
        ]);
      }
    }
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !composition.isComposing()) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClose = () => {
    setMessages([]);
    setInput("");
    setSearchResults([]);
    onClose();
  };

  const suggestedPrompts = [
    "推荐适合初学者的前端课程",
    "我想学习 AI 开发，从哪里开始？",
    "有哪些 DevOps 相关课程？",
    "React 和 Vue 哪个更适合我？",
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-foreground flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-background" />
              </div>
              <DialogTitle className="text-sm font-semibold">AI 智能助手</DialogTitle>
            </div>
            {/* Mode toggle */}
            <div className="flex items-center gap-1 bg-secondary rounded-full p-0.5">
              <button
                onClick={() => { setMode("search"); setMessages([]); setSearchResults([]); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  mode === "search" ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                <Search className="w-3 h-3 inline mr-1" />
                搜索
              </button>
              <button
                onClick={() => { setMode("chat"); setMessages([]); setSearchResults([]); }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  mode === "chat" ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                <Sparkles className="w-3 h-3 inline mr-1" />
                对话
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                {mode === "search" ? "搜索你感兴趣的课程" : "向 AI 提问任何学习问题"}
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                {mode === "search"
                  ? "用自然语言描述你想学的内容"
                  : "AI 会根据平台课程内容为你解答"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setInput(p); }}
                    className="px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  <div
                    className={`flex gap-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-background" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                        msg.role === "user"
                          ? "bg-foreground text-background"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                  {/* Search results after assistant message */}
                  {msg.role === "assistant" && i === messages.length - 1 && searchResults.length > 0 && (
                    <div className="mt-3 ml-10 space-y-2">
                      {searchResults.map((course) => (
                        <Link key={course.id} href={`/course/${course.slug}`} onClick={handleClose}>
                          <div className="flex gap-3 p-3 rounded-xl border border-border bg-card hover:bg-secondary/50 transition-colors cursor-pointer">
                            {course.coverUrl ? (
                              <img
                                src={course.coverUrl}
                                alt={course.title}
                                className="w-16 h-10 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-16 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                                <BookOpen className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground line-clamp-1">
                                {course.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                {course.category && (
                                  <span
                                    style={{ color: course.category.color ?? "#6366f1" }}
                                  >
                                    {course.category.name}
                                  </span>
                                )}
                                {course.duration ? (
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="w-3 h-3" />
                                    {formatDuration(course.duration)}
                                  </span>
                                ) : null}
                                {course.rating && course.rating > 0 ? (
                                  <span className="flex items-center gap-0.5">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    {course.rating.toFixed(1)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-7 h-7 rounded-full bg-foreground flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-background" />
                  </div>
                  <div className="bg-secondary rounded-2xl px-4 py-2.5">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={composition.onCompositionStart}
              onCompositionEnd={composition.onCompositionEnd}
              placeholder={mode === "search" ? "搜索课程，例如：React 入门教程..." : "向 AI 提问..."}
              className="flex-1 max-h-24 resize-none min-h-9 text-sm"
              rows={1}
            />
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
