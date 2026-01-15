// bric/webmunk-core/src/notification-manager.mts
// NOTE: socket.io-client import commented out - notifications disabled for Django-only setup
// If Flask notification server is needed in future, uncomment and install: npm install socket.io-client

// import { io, Socket } from 'socket.io-client'
// Using a mock Socket type to prevent compilation errors when socket.io-client is not installed
type Socket = any

export interface Notification {
  id: string
  userId: string
  title: string
  message: string
  type: 'survey' | 'action' | 'reminder' | 'info'
  actionType: 'survey' | 'share_history' | 'complete_task' | 'acknowledge' | 'open_url'
  actionData: { [key: string]: any }
  createdAt: number
  expiresAt?: number
  status: 'unread' | 'read' | 'dismissed' | 'completed'
  userActivities: Array<{
    action: string
    timestamp: number
    details?: any
  }>
}

export interface NotificationManagerConfig {
  backendUrl?: string
  maxReconnectAttempts?: number
  storageKey?: string
}

export class NotificationManager {
   socket: Socket | null = null
   backendUrl: string = 'http://localhost:5000'
   currentUserId: string | null = null
   isConnected: boolean = false
   reconnectAttempts: number = 0
   maxReconnectAttempts: number = 5
   storageKey: string = 'webmunk_notifications'
   activityLogQueue: Array<any> = []

  constructor(config?: NotificationManagerConfig) {
    if (config?.backendUrl) {
      this.backendUrl = config.backendUrl
    }
    if (config?.maxReconnectAttempts) {
      this.maxReconnectAttempts = config.maxReconnectAttempts
    }
    if (config?.storageKey) {
      this.storageKey = config.storageKey
    }
  }

  /**
   * Initialize the notification system and connect to backend
   */
   async initialize(userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.currentUserId = userId
        
        // Notifications disabled - Flask/WebSocket support not configured for Django-only setup
        console.log('[NotificationManager] Notifications disabled (Flask-SocketIO server not configured)')
        this.isConnected = false
        
        // For Django-only setup, resolve without WebSocket
        resolve()
        
        /* DISABLED: socket.io-client removed for Django-only setup
        // Create socket connection with retry logic
        this.socket = io(this.backendUrl, {...})
        // ... rest of socket.io code
        */

      } catch (error) {
        console.error('[NotificationManager] Initialization error:', error)
        reject(error)
      }
    })
  }

  /**
   * Handle incoming notification from backend
   */
   handleIncomingNotification(data: any) {
    const notification: Notification = {
      id: data.id,
      userId: data.userId,
      title: data.title,
      message: data.message,
      type: data.type || 'info',
      actionType: data.actionType,
      actionData: data.actionData || {},
      createdAt: data.createdAt || Date.now(),
      expiresAt: data.expiresAt,
      status: 'unread',
      userActivities: []
    }

    console.log('[NotificationManager] Received notification:', notification)

    // Store notification persistently
    this.storeNotification(notification).then(async () => {
      // Update badge with unread count
      try {
        const notifications = await this.getNotifications()
        const unreadCount = notifications.filter((n) => n.status === 'unread').length
        
        if (unreadCount > 0) {
          chrome.action.setBadgeText({ text: unreadCount.toString() })
          chrome.action.setBadgeBackgroundColor({ color: '#FF0000' })
          console.log(`[NotificationManager] Badge updated to ${unreadCount}`)
        }
      } catch (error) {
        console.error('[NotificationManager] Error updating badge:', error)
      }

      // Notify extension popup that new notification arrived
      chrome.runtime.sendMessage({
        messageType: 'notificationReceived',
        notification: notification
      }).catch(() => {
        console.log('[NotificationManager] Popup not open, notification stored and badge updated')
      })
    })

    // Log activity: notification sent/received
    this.logActivity({
      notification_id: notification.id,
      user_id: this.currentUserId,
      action: 'received',
      timestamp: Date.now()
    })
  }

  /**
   * Store notification persistently in chrome storage
   */
   async storeNotification(notification: Notification): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.storageKey, (data) => {
        const notifications = data[this.storageKey] || []
        
        // Check if notification already exists (avoid duplicates)
        const exists = notifications.some((n: Notification) => n.id === notification.id)
        if (!exists) {
          notifications.push(notification)
        }
        
        chrome.storage.local.set({ [this.storageKey]: notifications }, () => {
          resolve()
        })
      })
    })
  }

  /**
   * Get all stored notifications
   */
   async getNotifications(): Promise<Notification[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.storageKey, (data) => {
        resolve(data[this.storageKey] || [])
      })
    })
  }

  /**
   * Get notification by ID
   */
   async getNotification(notificationId: string): Promise<Notification | null> {
    const notifications = await this.getNotifications()
    return notifications.find(n => n.id === notificationId) || null
  }

  /**
   * Update notification status
   */
   async updateNotificationStatus(
    notificationId: string,
    status: 'unread' | 'read' | 'dismissed' | 'completed'
  ): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.storageKey, (data) => {
        const notifications = data[this.storageKey] || []
        const notification = notifications.find((n: Notification) => n.id === notificationId)
        
        if (notification) {
          notification.status = status
          chrome.storage.local.set({ [this.storageKey]: notifications }, () => {
            resolve()
          })
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Log notification activity (viewed, clicked, action taken, etc.)
   */
   async logActivity(activityData: {
    notification_id: string
    user_id: string | null
    action: 'received' | 'viewed' | 'clicked' | 'action_completed' | 'action_declined' | 'dismissed'
    timestamp: number
    details?: any
  }): Promise<void> {
    if (!this.currentUserId) {
      console.warn('[NotificationManager] User ID not set, cannot log activity')
      return
    }

    const activity = {
      notification_id: activityData.notification_id,
      user_id: this.currentUserId,
      action: activityData.action,
      timestamp: new Date().toISOString(),
      details: activityData.details || {}
    }

    // Try to send to backend
    if (this.isConnected && this.socket) {
      this.socket.emit('log_notification_activity', activity)
      console.log('[NotificationManager] Activity logged via WebSocket:', activity)
    } else {
      // Queue for later if not connected
      this.activityLogQueue.push(activity)
      
      // Also try HTTP POST as backup
      this.sendActivityViaHTTP(activity)
    }
  }

  /**
   * Send activity log to backend via HTTP (backup method)
   */
   async sendActivityViaHTTP(activity: any): Promise<void> {
    try {
      const response = await fetch(`${this.backendUrl}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(activity)
      })

      if (response.ok) {
        console.log('[NotificationManager] Activity logged via HTTP')
      }
    } catch (error) {
      console.error('[NotificationManager] Failed to log activity via HTTP:', error)
    }
  }

  /**
   * Flush queued activities when connection is restored
   */
   async flushActivityQueue(): Promise<void> {
    while (this.activityLogQueue.length > 0) {
      const activity = this.activityLogQueue.shift()
      if (this.socket && this.isConnected) {
        this.socket.emit('log_notification_activity', activity)
      } else {
        this.activityLogQueue.unshift(activity)
        break
      }
    }
  }

  /**
   * Record notification activity in its history
   */
   async recordNotificationActivity(
    notificationId: string,
    action: string,
    details?: any
  ): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.storageKey, (data) => {
        const notifications = data[this.storageKey] || []
        const notification = notifications.find((n: Notification) => n.id === notificationId)
        
        if (notification) {
          notification.userActivities.push({
            action: action,
            timestamp: Date.now(),
            details: details
          })
          
          chrome.storage.local.set({ [this.storageKey]: notifications }, () => {
            resolve()
          })
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Clear a notification
   */
   async clearNotification(notificationId: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.storageKey, (data) => {
        const notifications = data[this.storageKey] || []
        const filtered = notifications.filter((n: Notification) => n.id !== notificationId)
        
        chrome.storage.local.set({ [this.storageKey]: filtered }, () => {
          resolve()
        })
      })
    })
  }

  /**
   * Clear all notifications
   */
   async clearAllNotifications(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKey]: [] }, () => {
        resolve()
      })
    })
  }

  /**
   * Disconnect from backend
   */
   disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.isConnected = false
    }
  }

  /**
   * Check if connected to backend
   */
   isBackendConnected(): boolean {
    return this.isConnected
  }
}
