export type GlobalNotification = {
  id: string;
  forumId: string;
  forumName: string;
  authorName: string;
  text: string;
  createdAt: number;
};

const MAX = 50;

let notifications: GlobalNotification[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNotifications(): GlobalNotification[] {
  return notifications;
}

export function addNotification(n: Omit<GlobalNotification, "id">) {
  notifications = [{ ...n, id: crypto.randomUUID() }, ...notifications].slice(0, MAX);
  emit();
}

export function clearNotifications() {
  notifications = [];
  emit();
}

export function removeNotification(id: string) {
  notifications = notifications.filter((n) => n.id !== id);
  emit();
}
