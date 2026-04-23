import { DangerousActionKey, DANGEROUS_ACTION_LABELS, getDangerousConfirmPhrase } from "@shared/adminAccess";

export function confirmDangerousAction(action: DangerousActionKey, message?: string) {
  if (typeof window === "undefined") return null;
  const phrase = getDangerousConfirmPhrase(action);
  const label = DANGEROUS_ACTION_LABELS[action] ?? action;
  const input = window.prompt(
    `${message ?? `你正在执行危险操作：${label}。`}\n请输入以下确认短语后继续：\n${phrase}`,
    ""
  );
  if (input === null) return null;
  return input.trim();
}
