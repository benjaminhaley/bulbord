import { and, desc, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.js'
import { notifications, users } from '../db/schema.js'

// Feedback #100: a unified in-app notification feed, replacing the earlier
// per-feature "unseen count from a last-seen timestamp" mechanisms
// (friendsSeenAt/getUnseenFriendCount, feedbackRepliesSeenAt/
// getUnseenFeedbackReplyCount — see CLAUDE.md's Connections/Feedback tab
// sections). Every notification-worthy event across the app funnels through
// createNotification() below, so the badge count and the /notifications
// list are always the same underlying data, never two mechanisms that can
// drift apart.
export type NotificationType = 'friend_added' | 'feedback_reply' | 'event_comment' | 'camp_comment' | 'sports_club_comment'

export interface CreateNotificationInput {
  userId: string // recipient
  type: NotificationType
  actorUserId: string | null // who triggered it
  message: string
  targetPath: string
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    actorUserId: input.actorUserId,
    message: input.message,
    targetPath: input.targetPath,
  })
}

const LIST_LIMIT = 100

export interface NotificationListItem {
  id: string
  type: string
  message: string
  targetPath: string
  actorName: string | null
  actorAvatarUrl: string | null
  createdAt: Date
  dismissedAt: Date | null
}

// Newest first, dismissed and undismissed together (feedback #100 doesn't
// ask for dismissed notifications to disappear from the list entirely, just
// to stop counting toward the badge — same "dismiss clears the count, not
// the history" shape as an email inbox's read/unread state) — capped at
// LIST_LIMIT so a long-inactive member doesn't load an unbounded history.
export async function listNotifications(userId: string): Promise<NotificationListItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      message: notifications.message,
      targetPath: notifications.targetPath,
      actorName: users.name,
      actorAvatarUrl: users.avatarUrl,
      createdAt: notifications.createdAt,
      dismissedAt: notifications.dismissedAt,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorUserId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(LIST_LIMIT)

  return rows
}

export async function getUnseenNotificationCount(userId: string): Promise<number> {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.dismissedAt)))
  return rows.length
}

// Ownership-checked — a notification can only be dismissed by its own
// recipient. Returns false (rather than throwing) for a not-found/not-yours
// id so the route can 404 without a separate existence check.
export async function dismissNotification(userId: string, notificationId: string): Promise<boolean> {
  const [updated] = await db
    .update(notifications)
    .set({ dismissedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), isNull(notifications.dismissedAt)))
    .returning({ id: notifications.id })
  return Boolean(updated)
}
