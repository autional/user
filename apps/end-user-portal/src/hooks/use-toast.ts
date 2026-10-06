import { useToast as useUiToast } from '@autional/ui';

export function useToast() {
	const { addToast } = useUiToast();

	return {
		success: (message: string, duration?: number) => addToast(message, 'success', duration),
		error: (message: string, duration?: number) => addToast(message, 'error', duration),
		warning: (message: string, duration?: number) => addToast(message, 'warning', duration),
		info: (message: string, duration?: number) => addToast(message, 'info', duration),
	};
}
