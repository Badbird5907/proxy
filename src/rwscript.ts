export const getRewriteScript = (rules: string[], selectors: string[], baseUrl: string, targetOrigin: string): string => {
	// selectors are [a[href], img[src], link[href]] etc
	return `
	const rules = JSON.parse('${JSON.stringify(rules)}');
	const selectors = JSON.parse('${JSON.stringify(selectors)}');
	const baseUrl = '${baseUrl}'; // https://proxy/?url=%url%&rewrite=...
	const origin = window.location.origin;
	const targetOrigin = '${targetOrigin}'; // the actual site

	const checkUrl = (url) => {
	  // return true if the url is properly formatted (https://proxy/?url=...)
		return url.startsWith(origin);
	}

	const rewrite = (element) => {
	  if (true) return;
	  // href, src, action
		const attrName = element.getAttributeNames().find(attr => attr.endsWith('href') || attr.endsWith('src') || attr.endsWith('action'));
		if (!attrName) return;
		const attr = element.getAttribute(attrName);
		if (!attr) return;
		if (checkUrl(attr)) return;
		// https://proxy/?url=...&rewrite=...
		const targetUrl = new URL(attr, targetOrigin);
		const newUrl = new URL(baseUrl);
		newUrl.searchParams.set('url', targetUrl.href);
		newUrl.searchParams.set('rewrite', rules.join(','));
		element.setAttribute(attrName, newUrl.href);
		console.log('rewriting', attrName, attr, newUrl.href);
	}

	const rewritePage = () => {
	  console.log('rewriting html');
		selectors.forEach(selector => {
			document.querySelectorAll(selector).forEach(rewrite);
		})
	}

	rewritePage();
	window.addEventListener('load', rewritePage);
	window.addEventListener('DOMContentLoaded', rewritePage);



	`
}

export const getServiceWorkerScript = (baseUrl: string, targetOrigin: string): string => {
	// intercept http requests and rewrite them
	return `
	console.log('rw service worker running');
	const baseUrl = '${baseUrl}'; // https://proxy/?url=%url%&rewrite=...
	const origin = self.location.origin;
	const targetOrigin = '${targetOrigin}'; // the actual site

  const checkUrl = (url) => {
    // return true if the url is properly formatted (https://proxy/?url=...)
    return url.startsWith(origin) && (new URL(url)).searchParams.has('url');
  }
	self.addEventListener('fetch', (event) => {
		const url = new URL(event.request.url);
		console.log('[SW] checking', url.href);
		if (checkUrl(url.href)) {
			const targetUrl = new URL(url.searchParams.get('url'), targetOrigin);
			const rewriteRules = url.searchParams.get('rewrite').split(',');
			const newUrl = new URL(baseUrl);
			newUrl.searchParams.set('url', targetUrl.href);
			newUrl.searchParams.set('rewrite', rewriteRules.join(','));
			const newRequest = new Request(newUrl.href);
			console.log('[SW] rewriting', url.href, 'to', newRequest.url);
			event.respondWith(fetch(newRequest));
		}
	});
	`
}
