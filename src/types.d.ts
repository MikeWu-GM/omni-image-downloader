interface Window {
	__devIframe?: HTMLIFrameElement;
	__idleDomTimer?: ReturnType<typeof setTimeout>;
	__maxIdleDomTimer?: ReturnType<typeof setTimeout>;
	__resolveIdleDom?: () => void;
	__observer?: MutationObserver;
}
