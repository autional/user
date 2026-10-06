import { pushSubscriptionsPost, pushSubscriptionsDelete } from '@autional/shared/generated/api';
export { getVapidPublicKey, subscribeBrowserPush, unsubscribeBrowserPush } from '@autional/shared';

export async function registerPushSubscription(subscription: PushSubscription): Promise<{
	endpoint: string;
	keys: { p256dh: string; auth: string };
	deviceType: string;
} | null> {
	const json = subscription.toJSON();
	if (!json.keys?.p256dh || !json.keys?.auth || !json.endpoint) {
		return null;
	}
	const body = {
		endpoint: json.endpoint,
		keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
		deviceType: 'web',
	};
	await pushSubscriptionsPost(body as any);
	return body;
}

export async function unregisterPushSubscription(): Promise<void> {
	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (subscription) {
		await subscription.unsubscribe();
		await pushSubscriptionsDelete({ endpoint: subscription.endpoint });
	}
}

export async function isPushSupported(): Promise<boolean> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		return false;
	}
	const permission = Notification.permission;
	if (permission === 'denied') {
		return false;
	}
	return true;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!('Notification' in window)) {
		return 'denied';
	}
	return Notification.requestPermission();
}
